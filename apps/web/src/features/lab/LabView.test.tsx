import {afterEach,expect,it,vi} from 'vitest'
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react'
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
