import {afterEach,expect,it,vi} from 'vitest'
import {render,screen,fireEvent,cleanup,waitFor,act} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {LabView} from './LabView'
import {useUi} from '@/store/ui'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
// Network responses here are test fixtures, not generated evidence.
it('requires candidate context and suggestions only prefill',async()=>{
 const fetcher=vi.fn(async(_input: RequestInfo | URL)=>new Response(JSON.stringify({copilot:{ready:false,model:'test fixture',detail:'fixture'},candidates:[]})))
 vi.stubGlobal('fetch',fetcher);useUi.setState({selectedCandidateId:null})
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><LabView/></QueryClientProvider>)
 expect(screen.getByText('Select a candidate before sending a research question.')).toBeTruthy()
 useUi.setState({selectedCandidateId:'fixture-a'})
 await waitFor(()=>expect(screen.getByLabelText('Research question')).toBeTruthy())
 fireEvent.click(screen.getByText('What evidence is missing?'))
 expect((screen.getByLabelText('Research question') as HTMLTextAreaElement).value).toBe('What evidence is missing?')
 expect(fetcher.mock.calls.every(args=>!String(args[0]).includes('/lab/chat'))).toBe(true)
})

function fixtureAnswer(mode='generated',answer='Fixture evidence answer') {
 return {answer,mode,provider:'ollama',model:'qwen3:4b',boundary:'Fixture research boundary',citations:[{id:'SRC-1',title:'Fixture source',excerpt:'Fixture source excerpt',source_url:'https://example.org/fixture'}]}
}
function mountNetwork(chat:(init?:RequestInit)=>Promise<Response>, model?:()=>Response, train?:()=>Response){
 const calls:{path:string;init?:RequestInit}[]=[]
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const path=String(input);calls.push({path,init})
  if(path==='/api/lab/chat')return chat(init)
  if(path==='/api/lab/model/train'&&train)return train()
  if(path==='/api/lab/model'&&model)return model()
  return json({copilot:{ready:false,provider:'ollama',model:'qwen3:4b',detail:'Fixture provider unavailable'},candidates:[]})
 }))
 useUi.setState({selectedCandidateId:'fixture-a',sessionId:'fixture-session'})
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><LabView/></QueryClientProvider>)
 return calls
}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status})}
async function send(question='What evidence supports this candidate?'){
 fireEvent.change(await screen.findByLabelText('Research question'),{target:{value:question}})
 fireEvent.click(screen.getByRole('button',{name:'Send question'}))
}
it('sends candidate and session context and opens returned citation evidence',async()=>{
 const calls=mountNetwork(async()=>json(fixtureAnswer()))
 await send()
 expect(await screen.findByText('Fixture evidence answer')).toBeTruthy()
 const request=calls.find(c=>c.path==='/api/lab/chat')!
 expect(request.init?.method).toBe('POST')
 expect(JSON.parse(String(request.init?.body))).toEqual({question:'What evidence supports this candidate?',candidate_id:'fixture-a',session_id:'fixture-session'})
 fireEvent.click(screen.getByRole('button',{name:/SRC-1/}))
 expect(await screen.findByText('Fixture source excerpt')).toBeTruthy()
 expect(screen.getByRole('link',{name:'Open source'}).getAttribute('href')).toBe('https://example.org/fixture')
})
it('does not show a pending old candidate answer under a new candidate',async()=>{
 let resolve!:(response:Response)=>void
 const pending=new Promise<Response>(r=>{resolve=r})
 const calls=mountNetwork(async()=>pending)
 await send()
 await waitFor(()=>expect(calls.filter(c=>c.path==='/api/lab/chat')).toHaveLength(1))
 act(()=>useUi.setState({selectedCandidateId:'fixture-b'}))
 await waitFor(()=>expect(screen.getByText('fixture-b')).toBeTruthy())
 await act(async()=>{resolve(json(fixtureAnswer('generated','Answer exclusively for fixture-a')));await pending;await new Promise(r=>setTimeout(r,20))})
 expect(screen.queryByText('Answer exclusively for fixture-a')).toBeNull()
 expect((screen.getByLabelText('Research question') as HTMLTextAreaElement).value).toBe('')
})
it('labels provider fallback as evidence search without claiming generation',async()=>{
 mountNetwork(async()=>json(fixtureAnswer('evidence_search')))
 await send()
 expect(await screen.findByText('Evidence search')).toBeTruthy()
 expect(screen.queryByText(/Generated with/)).toBeNull()
 expect(screen.getByText('Fixture evidence answer')).toBeTruthy()
})
it('preserves an edited draft after a failed request and retries it',async()=>{
 let attempts=0
 const calls=mountNetwork(async()=>++attempts===1?json({error:'fixture outage'},503):json(fixtureAnswer()))
 await send('First draft')
 await screen.findByRole('alert')
 expect((screen.getByLabelText('Research question') as HTMLTextAreaElement).value).toBe('First draft')
 fireEvent.change(screen.getByLabelText('Research question'),{target:{value:'Revised research question'}})
 fireEvent.click(screen.getByRole('button',{name:/Retry question|Send question/}))
 expect(await screen.findByText('Fixture evidence answer')).toBeTruthy()
 expect(calls.filter(c=>c.path==='/api/lab/chat').map(c=>JSON.parse(String(c.init?.body)).question)).toEqual(['First draft','Revised research question'])
})
it('posts training parameters then polls the server until ready and displays honest metrics',async()=>{
 let started=false;let reads=0;let trainingReadAt=0;let readyReadAt=0
 const report={run_id:'fixture-run',created_at:'2026-11-06',algorithm:'random_forest',task:'discovery reversal',seed:20261105,n_train:80,n_test:20,n_excluded:3,split:'fixture split',feature_count:2048,metrics:{mae:0.4,baseline_mae:0.3,r2:-0.2,spearman:null},training_sources:['Fixture discovery source'],limitations:['Fixture internal test only'],provenance:{fixture:true}}
 const calls=mountNetwork(async()=>json(fixtureAnswer()),()=>{
  if(!started)return json({status:'not_trained'})
  reads++
  if(reads===1){trainingReadAt=Date.now();return json({status:'training'})}
  readyReadAt=Date.now();return json({status:'ready',report})
 },()=>{started=true;return json({status:'training'})})
 fireEvent.click(screen.getByRole('tab',{name:'Model studio'}))
 await screen.findByText('Ready to train')
 fireEvent.click(screen.getByRole('button',{name:'Train random forest'}))
 await screen.findByText(/Training job running/)
 await screen.findByText('Internal test results',{}, {timeout:5000})
 expect(readyReadAt-trainingReadAt).toBeGreaterThanOrEqual(1900)
 const request=calls.find(c=>c.path==='/api/lab/model/train')!
 expect(request.init?.method).toBe('POST')
 expect(JSON.parse(String(request.init?.body))).toEqual({algorithm:'random_forest',seed:20261105})
 expect(screen.getByText(/does not improve on/)).toBeTruthy()
 expect(screen.getByText(/Negative R²/)).toBeTruthy()
 expect(screen.getByText('Fixture internal test only')).toBeTruthy()
 expect(screen.getByText('Training mean baseline MAE')).toBeTruthy()
 const completedReads=calls.filter(c=>c.path==='/api/lab/model').length
 await new Promise(r=>setTimeout(r,2200))
 expect(calls.filter(c=>c.path==='/api/lab/model')).toHaveLength(completedReads)
},10000)
