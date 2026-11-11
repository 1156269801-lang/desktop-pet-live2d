(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PetAppearance=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict'
  const DEFAULTS=Object.freeze({version:1,fontSize:16,gap:12,sceneMode:'color',sceneColor:'#e7f0f7',sceneImage:'',sceneName:'',sceneOpacity:90,sceneFit:'cover',bubbleColor:'#f8fbff',bubbleImage:'',bubbleName:'',bubbleTint:82,chatDock:true})
  const imagePattern=/^\/user-assets\/backgrounds\/[a-f0-9]{64}\.png$/
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v))
  function luminance(hex){return hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).reduce((a,v,i)=>a+[.2126,.7152,.0722][i]*(v<=.04045?v/12.92:((v+.055)/1.055)**2.4),0)}
  function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
  function ink(color,image=false){if(image||contrast(color,'#1b2a44')>=4.5)return '#1b2a44';return contrast(color,'#000000')>=4.5?'#000000':'#ffffff'}
  function normalize(input={}){
    const out={...DEFAULTS}
    for(const [k,lo,hi] of [['fontSize',12,28],['gap',4,40],['sceneOpacity',20,100],['bubbleTint',70,100]])if(typeof input[k]==='number'&&Number.isFinite(input[k]))out[k]=Math.round(clamp(input[k],lo,hi))
    for(const k of ['sceneColor','bubbleColor'])if(/^#[a-fA-F0-9]{6}$/.test(input[k]||''))out[k]=input[k].toLowerCase()
    for(const k of ['sceneImage','bubbleImage'])if(typeof input[k]==='string'&&imagePattern.test(input[k]))out[k]=input[k]
    for(const k of ['sceneName','bubbleName'])if(typeof input[k]==='string')out[k]=input[k].slice(0,160)
    if(['transparent','color','image'].includes(input.sceneMode))out.sceneMode=input.sceneMode
    if(['cover','contain'].includes(input.sceneFit))out.sceneFit=input.sceneFit
    if(typeof input.chatDock==='boolean')out.chatDock=input.chatDock
    if(out.sceneMode==='image'&&!out.sceneImage)out.sceneMode='color'
    return out
  }
  // Real measured bubble height is used, rather than a fixed top offset.
  function positionBubble({vw,vh,cx,headTop,width,height,gap=12}){
    const edge=10,w=Math.min(width,Math.max(1,vw-edge*2)),h=Math.min(height,Math.max(1,vh-edge*2))
    const left=clamp(cx-w/2,edge,Math.max(edge,vw-w-edge))
    const above=headTop-gap-h
    const placement=above>=edge?'above':'below'
    const top=placement==='above'?above:clamp(headTop+gap+44,edge,Math.max(edge,vh-h-edge))
    return {left,top,width:w,height:h,placement,tail:clamp(cx-left,20,Math.max(20,w-20))}
  }
  return {DEFAULTS,normalize,positionBubble,ink,contrast}
})
