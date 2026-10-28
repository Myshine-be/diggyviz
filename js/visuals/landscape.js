// Sculpted sand, slowly travelled. A tiny one-dimensional height texture retains measured beat ridges.
import {createDunes,advanceDunes,bakeDunes,DUNE_SAMPLES} from './dune-ridges.js';
const states=new WeakMap();
export default {
  id:'landscape',name:'Dunes',bloom:.12,grade:.2,
  lyrics:{y:{land:.82,port:.79},font:'serif',occlude:false,ink:[.97,.91,.8]},
  uniforms({gl,loc,frame,slot}) {
    let s=states.get(slot);
    if(!s){s={model:createDunes(),tex:null};states.set(slot,s);}
    if(!s.tex||!gl.isTexture(s.tex)) {
      s.tex=gl.createTexture();gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,s.tex);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.R16F,DUNE_SAMPLES,1,0,gl.RED,gl.FLOAT,null);
      for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
    }
    advanceDunes(s.model,frame.audio,frame.dt);
    gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,s.tex);
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,DUNE_SAMPLES,1,gl.RED,gl.FLOAT,bakeDunes(s.model));
    if(loc.uDuneProfile)gl.uniform1i(loc.uDuneProfile,4);
    if(loc.uDuneTravel)gl.uniform1f(loc.uDuneTravel,s.model.travel);
  },
  dispose(gl,slot){const s=states.get(slot);if(s?.tex)gl.deleteTexture(s.tex);states.delete(slot);},
  frag: /* glsl */ `
uniform sampler2D uDuneProfile;
uniform float uDuneTravel;
float terrain(vec2 p) {
  float curve=1.05*sin(p.x*.44)+.42*sin(p.x*.91+p.y*.13);
  float z=p.y+curve;
  float uv=(z-(uDuneTravel-4.0))/48.0;
  float ridge=texture(uDuneProfile,vec2((clamp(uv,0.0,1.0)*511.0+.5)/512.0,.5)).r;
  return ridge*(.82+.18*sin(p.x*.29+p.y*.17))+.055*sin(p.x*.8+p.y*.23);
}
void main() {
  vec2 p=P();
  vec3 horizon=mix(vec3(.57,.34,.20),pal(.8)*.45+vec3(.27,.19,.13),.27);
  vec3 zenith=mix(vec3(.055,.095,.14),uPal[0]*.45,.35);
  vec3 sky=mix(horizon,zenith,smoothstep(.03,.65,p.y));
  vec2 sunP=p-vec2(-.62,.26);
  float sun=1.0-smoothstep(.035,.04,length(sunP));
  sky+=vec3(.40,.28,.13)*sun+vec3(.13,.07,.03)*exp(-length(sunP)*8.0);
  vec3 ro=vec3(0,2.35,uDuneTravel),rd=normalize(vec3(p.x,p.y-.13,1.25));
  vec3 col=sky;
  if(rd.y<.025) {
    float t=.2,prevT=t;bool hit=false;
    // Conservative height-field steps. Sky rays exit early; terrain never exceeds camera height.
    for(int i=0;i<90;i++) {
      vec3 q=ro+rd*t;
      float d=q.y-terrain(q.xz);
      if(d<.006){hit=true;break;}
      prevT=t;t+=clamp(d*.55,.035,1.3);
      if(t>40.0)break;
    }
    if(hit) {
      // Refine the first crossing so near crests don't wobble as the camera moves.
      float lo=prevT,hi=t;
      for(int j=0;j<4;j++){float mid=(lo+hi)*.5;vec3 v=ro+rd*mid;if(v.y>terrain(v.xz))lo=mid;else hi=mid;}
      t=(lo+hi)*.5;vec3 q=ro+rd*t;
      float e=.025,h=terrain(q.xz);
      vec3 n=normalize(vec3(terrain(q.xz-vec2(e,0))-terrain(q.xz+vec2(e,0)),2.0*e,terrain(q.xz-vec2(0,e))-terrain(q.xz+vec2(0,e))));
      vec3 light=normalize(vec3(-.8,.42,-.35));
      float dif=max(dot(n,light),0.0);
      float shadow=1.0;
      for(int j=1;j<=5;j++){float d=float(j)*.45;float ground=terrain(q.xz+light.xz*d);shadow=min(shadow,smoothstep(-.02,.17,q.y+light.y*d-ground));}
      vec3 sand=mix(vec3(.64,.37,.16),pal(.6)*.45+vec3(.36,.25,.13),.20);
      float ripple=.5+.5*sin(q.z*65.0+q.x*6.0+3.0*sin(q.x*.7));
      float detail=(ripple-.5)*.06*(1.0-smoothstep(4.0,13.0,t));
      col=sand*(.28+.72*dif*(.40+.60*shadow)+detail);
      col+=vec3(.12,.065,.025)*pow(max(n.y,0.0),8.0);
      // Immediate, localized loose sand on a nearby crest, separate from the slow memory of dunes.
      float dust=exp(-pow((h-.55)*13.0,2.0))*exp(-pow((t-5.0)*.45,2.0));
      float gust=noise2(q.xz*12.0+vec2(uTime*1.5,0));
      col+=sand*dust*gust*(uKick*.20+histSmooth(.85,0.0)*.08);
      float fog=1.0-exp(-t*t*.0026);
      col=mix(col,horizon,fog);
    }
  }
  fragColor=vec4(col,1);
}`,
};
