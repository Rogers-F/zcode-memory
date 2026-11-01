// Test-only controlled counterpart of the verified DSH ConfigForms Interface.
export function fakeNativeSettings({enabled=false,writable=true,status='ready',accepted=true,readError=null}={}) {
  const calls=[];
  let snapshot={status,value:{enabled},writable,revision:1};
  const mirror={async load(){calls.push('describe');},getSnapshot(){return {status:'ready',error:readError};}};
  const form={getSnapshot(){return snapshot;},async set(field,value){calls.push(['set',field,value]);if(accepted)snapshot={...snapshot,value:{...snapshot.value,[field]:value},revision:snapshot.revision+1};return accepted;}};
  const configForms={get(id){if(id!=='zcode-memory')throw new Error('Wrong namespace');return form;},describe(){return mirror;},whileServed(names,register){return register(new Set(names));}};
  return {calls,form,mirror,configForms,setSnapshot(value){snapshot=value;}};
}
export function addNativeContext(context, fixture=fakeNativeSettings()) {
  const dictionaries=new Map();
  return {...context,configForms:fixture.configForms,
    effect:factory=>factory(),
    locale:{register(ns,dict){dictionaries.set(ns,dict);return()=>dictionaries.delete(ns);},bind:ns=>key=>dictionaries.get(ns)?.zh[key]??key},
  };
}
