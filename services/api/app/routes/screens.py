"""Live screen submission, polling and SSE transport."""
import asyncio
import json
from email.parser import BytesParser
from email.policy import default

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, StreamingResponse

from app.services import jobs
from app.services import projects as store

router = APIRouter()
MAX_UPLOAD = 10 * 1024 * 1024


@router.post('/screens')
async def start(request: Request):
    store.seed()
    content = await request.body()
    if len(content) > MAX_UPLOAD:
        raise HTTPException(422, 'Upload exceeds 10 MB')
    ctype = request.headers.get('content-type', '')
    if ctype.startswith('multipart/form-data'):
        # stdlib MIME parsing avoids an additional runtime multipart dependency.
        message = BytesParser(policy=default).parsebytes(
            f'Content-Type: {ctype}\r\nMIME-Version: 1.0\r\n\r\n'.encode() + content)
        parts = {p.get_param('name', header='content-disposition'): p.get_payload(decode=True)
                 for p in message.iter_parts()}
        if 'file' not in parts or not ('project_id' in parts or 'name' in parts):
            raise HTTPException(422, 'file and project_id or name are required')
        # Validate before any project exists, so a bad file never leaves an empty project.
        signature = store.parse_csv(parts['file'])
        if 'project_id' in parts:
            project = store.get('project', parts['project_id'].decode())
            if project.get('kind') == 'builtin':
                raise HTTPException(422, 'Uploads need their own project')
            return jobs.submit(project['id'], signature=signature)
        project = store.create(parts['name'].decode(errors='replace')[:120] or 'Upload', None)
        return jobs.submit(project['id'], signature=signature, new_project=True)
    try:
        body = json.loads(content)
        return jobs.submit(body['project_id'], body['signature_id'])
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(422, 'project_id and signature_id are required') from exc


@router.get('/screens/template.csv')
def template():
    return Response(store.template_csv(), media_type='text/csv',
                    headers={'Content-Disposition': 'attachment; filename="signature_template.csv"'})


@router.get('/screens/{screen_id}')
def get(screen_id: str):
    store.seed()
    return jobs.snapshot(screen_id)


@router.get('/screens/{screen_id}/events')
def events(screen_id: str):
    store.seed()
    jobs.snapshot(screen_id)

    async def stream():
        while True:
            obj = jobs.snapshot(screen_id)
            yield 'data: ' + json.dumps(obj) + '\n\n'
            if obj['status'] in ('done', 'failed'):
                break
            await asyncio.sleep(.5)
    return StreamingResponse(stream(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
