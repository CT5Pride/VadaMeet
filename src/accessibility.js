const root=document.documentElement;
const systemMotion=matchMedia('(prefers-reduced-motion: reduce)');
let preferences={contrast:false,large:false,motion:systemMotion.matches};
try{const saved=JSON.parse(localStorage.getItem('vada-display'));if(saved)for(const key of Object.keys(preferences))if(typeof saved[key]==='boolean')preferences[key]=saved[key]}catch{}
let timer=null,index=0;
const slides=[
 {src:'/images/connection-video.jpg',alt:'Illustrative scene of two men smiling on a video date from their homes',caption:'Different places. A shared moment.'},
 {src:'/images/connection-cafe.jpg',alt:'Illustrative scene of two men smiling at each other across a café table',caption:'The warmth of a date. Wherever you are.'}
];
function apply(){root.classList.toggle('high-contrast',preferences.contrast);root.classList.toggle('large-text',preferences.large);root.classList.toggle('reduce-motion',preferences.motion);if(preferences.motion||systemMotion.matches)stopHero()}
apply();
export function stopHero(){clearInterval(timer);timer=null;const b=document.querySelector('#photo-play');if(b){b.textContent='Play slideshow';b.setAttribute('aria-pressed','false')}}
function showSlide(next){index=(next+slides.length)%slides.length;const s=slides[index],img=document.querySelector('#connection-image');if(!img)return stopHero();img.src=s.src;img.alt=s.alt;document.querySelector('#connection-caption').textContent=s.caption;document.querySelector('#photo-count').textContent=`${index+1} / ${slides.length}`}
export function mountHero(){stopHero();index=0;document.querySelector('#photo-prev').onclick=()=>{stopHero();showSlide(index-1)};document.querySelector('#photo-next').onclick=()=>{stopHero();showSlide(index+1)};document.querySelector('#photo-play').onclick=()=>{if(timer)return stopHero();if(preferences.motion||systemMotion.matches){document.querySelector('#photo-play').textContent='Use arrows · reduced motion';return}timer=setInterval(()=>showSlide(index+1),7000);const b=document.querySelector('#photo-play');b.textContent='Pause slideshow';b.setAttribute('aria-pressed','true')};document.querySelector('.connection-gallery').addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();stopHero();showSlide(index+(e.key==='ArrowRight'?1:-1))}})}
export function initAccessibility(){
 const dialog=document.createElement('dialog');dialog.id='display-settings';dialog.setAttribute('aria-labelledby','display-title');dialog.innerHTML='<button type="button" class="close" aria-label="Close accessibility settings">×</button><h2 id="display-title">Make Vada comfortable.</h2><p>Choose how the site looks on this device.</p><div class="stack"><label class="check"><input type="checkbox" data-display="contrast">Higher contrast</label><label class="check"><input type="checkbox" data-display="large">Larger text</label><label class="check"><input type="checkbox" data-display="motion">Reduce motion and stop slideshows</label></div><p class="tiny">Preferences are saved in this browser. Your device’s reduced-motion setting also stops slideshows.</p><button type="button" class="button outline" id="display-reset">Reset display settings</button>';
 document.body.append(dialog);
 const sync=()=>dialog.querySelectorAll('[data-display]').forEach(el=>el.checked=preferences[el.dataset.display]);
 const save=()=>{apply();try{localStorage.setItem('vada-display',JSON.stringify(preferences))}catch{}};
 dialog.querySelector('.close').onclick=()=>dialog.close();
 document.querySelector('#accessibility-open').onclick=()=>{sync();dialog.showModal()};
 dialog.querySelectorAll('[data-display]').forEach(el=>el.onchange=()=>{preferences[el.dataset.display]=el.checked;save()});
 dialog.querySelector('#display-reset').onclick=()=>{preferences={contrast:false,large:false,motion:systemMotion.matches};save();sync()};
 document.querySelector('#skip-content').onclick=e=>{e.preventDefault();document.querySelector('#app').focus();document.querySelector('#app').scrollIntoView({behavior:'auto'})};
 systemMotion.addEventListener('change',()=>{if(systemMotion.matches)stopHero()});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopHero()});
}
