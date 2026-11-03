(()=>{
'use strict';

/* =====================================================================
   UNWRITTEN: plain JavaScript, no libraries.
   Sections: helpers · page menu · prompt and streak · blog · notes ·
             letter (one layout drives preview, print and PNG) · backup · offline
   ===================================================================== */

/* ---------- helpers ---------- */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const K={posts:'liha.posts',notes:'liha.notes',letter:'liha.letter',days:'liha.days',draft:'liha.draft',hide:'liha.hideSamples',theme:'liha.theme',lang:'liha.lang'};
const zens={};                                   /* open/close functions of each zen box */
const SYNCED={'liha.posts':'posts','liha.notes':'notes','liha.letter':'letter','liha.days':'days'}; /* these four are saved to the account when signed in */
const store={
  get(k){try{return localStorage.getItem(k)}catch(e){return null}},
  set(k,v){let same=false;try{same=localStorage.getItem(k)===v;localStorage.setItem(k,v)}catch(e){}const n=SYNCED[k];if(n&&!same&&window.LihaSync)window.LihaSync.push(n)},
  del(k){try{localStorage.removeItem(k)}catch(e){}}
};
const parse=(s,fb)=>{try{const v=JSON.parse(s);return v==null?fb:v}catch(e){return fb}};
function h(tag,attrs={},...kids){
  const e=document.createElement(tag);
  for(const[k,v]of Object.entries(attrs)){
    if(k==='class')e.className=v;
    else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);
    else if(v===true)e.setAttribute(k,'');
    else if(v!==false&&v!=null)e.setAttribute(k,v);
  }
  for(const c of kids.flat())if(c!=null&&c!==false)e.append(c);
  return e;
}
const reduceMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const toastEl=$('#toast');let tt;
function toast(m){toastEl.textContent=m;toastEl.hidden=false;clearTimeout(tt);tt=setTimeout(()=>{toastEl.hidden=true},2800)}
window.LihaToast=toast;
/* login screen first (only when Firebase is set up and login is required): hide the app until we know who you are */
{const c=window.LIHA_FIREBASE||{};
 if(c.requireLogin&&c.apiKey&&!/^PASTE/.test(c.apiKey)&&!store.get('liha.uid')){
   document.body.classList.add('locked');
   /* never leave a blank screen: if the login service has not answered in 6 seconds, say so */
   setTimeout(()=>{const lg=$('#login');
     if(document.body.classList.contains('locked')&&lg&&lg.hidden){
       lg.hidden=false;const e=$('#login-err');
       e.textContent="Couldn't start the login service. Check your internet, then refresh the page.";e.hidden=false}},6000)}}
const keyOf=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const todayISO=()=>keyOf(new Date());
const fmt=iso=>{const d=new Date(iso+'T00:00:00');return isNaN(d)?iso:d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})};
const isDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s);
const str=(v,max)=>typeof v==='string'?v.slice(0,max):'';

function saveBlob(name,blob){
  const url=URL.createObjectURL(blob),a=h('a',{href:url,download:name});
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
const saveText=(name,text,type='text/plain;charset=utf-8')=>saveBlob(name,new Blob([text],{type}));
const toBlob=(c,type='image/png',q)=>new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('toBlob failed')),type,q));
async function copyText(text,msg){
  try{await navigator.clipboard.writeText(text);toast(msg);return}catch(e){}
  try{
    const ta=h('textarea',{style:'position:fixed;opacity:0;top:0;left:0'});ta.value=text;document.body.append(ta);ta.select();
    const ok=document.execCommand('copy');ta.remove();
    toast(ok?msg:'Select the text and copy it');
  }catch(e){toast('Select the text and copy it')}
}
let canShareFiles=false;
try{canShareFiles=!!(navigator.canShare&&navigator.canShare({files:[new File(['x'],'x.png',{type:'image/png'})]}))}catch(e){}
async function shareBlobs(blobs,names,title){
  try{await navigator.share({files:blobs.map((b,i)=>new File([b],names[i],{type:'image/png'})),title})}
  catch(e){if(e&&e.name!=='AbortError')toast('Sharing is not available here. Use download instead.')}
}
/* make sure the right font files are loaded before drawing on a canvas */
async function ensureFonts(text){
  if(!document.fonts)return;
  const t=(text||'')+'Aअ';
  try{await Promise.all(['400 40px Kalam','700 40px Kalam','400 40px Mukta','600 40px Mukta','800 40px Mukta','400 40px Anton'].map(f=>document.fonts.load(f,t)))}catch(e){}
}
/* break text into lines that fit maxW (ctx.font must already be set) */
function wrapLines(ctx,text,maxW){
  const out=[];
  for(const para of String(text||'').replace(/\r/g,'').split('\n')){
    if(!para.trim()){out.push('');continue}
    let line='';
    for(const word of para.split(/\s+/).filter(Boolean)){
      const t=line?line+' '+word:word;
      if(ctx.measureText(t).width<=maxW){line=t;continue}
      if(line)out.push(line);
      let w=word;
      while(ctx.measureText(w).width>maxW){
        let i=Array.from(w).length;
        while(i>1&&ctx.measureText(Array.from(w).slice(0,i).join('')).width>maxW)i--;
        out.push(Array.from(w).slice(0,i).join(''));w=Array.from(w).slice(i).join('');
      }
      line=w;
    }
    out.push(line);
  }
  return out;
}
const mctx=document.createElement('canvas').getContext('2d');
const MM=300/25.4,PG={W:Math.round(210*MM),H:Math.round(297*MM)}; /* A4 at 300 dpi = 2480 x 3508 */
const LH=9,ROWS=28,PADX=20,PADT=22,DY=0;                            /* in mm: line height, rows/page, margins */
function noteShape(ctx,x,y,w,hh){
  const r=18,br=150;
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+hh-br);ctx.quadraticCurveTo(x+w,y+hh,x+w-br,y+hh);
  ctx.lineTo(x+r,y+hh);ctx.quadraticCurveTo(x,y+hh,x,y+hh-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
function confettiPop(originEl){
  if(reduceMotion())return;
  const box=h('div',{class:'pop-confetti','aria-hidden':'true'});
  const colors=['#FF6A18','#FF4A5C','#1F6FE0','#F8E96B','#6578EC','#FF9A4D'];
  const rect=originEl?originEl.getBoundingClientRect():{left:window.innerWidth/2,top:window.innerHeight/2,width:0,height:0};
  const ox=rect.left+rect.width/2,oy=rect.top+Math.min(rect.height/2,220);
  box.style.left=ox+'px';box.style.top=oy+'px';
  for(let i=0;i<26;i++){
    const angle=(i/26)*Math.PI*2+(Math.random()*0.2-0.1);
    const dist=70+Math.random()*130;
    const dx=Math.cos(angle)*dist;
    const dy=Math.sin(angle)*dist+25;
    const rot=Math.random()*360;
    const isRound=i%3===0;
    const piece=h('span',{
      class:'pop-dot'+(isRound?' round':''),
      style:`--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;--rot:${rot.toFixed(0)}deg;--c:${colors[i%colors.length]}`
    });
    box.append(piece);
  }
  document.body.append(box);
  setTimeout(()=>box.remove(),1150);
}
/* two-tap guard for risky buttons: first tap changes the label, second tap does it */
function armed(btn,label,action){
  btn.addEventListener('click',()=>{
    if(!btn.dataset.armed){
      const old=btn.textContent;btn.dataset.armed='1';btn.textContent=label;
      setTimeout(()=>{delete btn.dataset.armed;btn.textContent=old},4000);return;
    }
    delete btn.dataset.armed;action();
  });
}

/* ---------- i18n dictionary (Phase 6) ---------- */
const I18N={
  en:{
    nav_home:'Home',nav_blog:'Blog',nav_notes:'Sticky Notes',nav_letter:'Letters',
    nav_home_sub:'Your writing desk',nav_blog_sub:"Tell today's story",nav_notes_sub:'Leave a little thought',nav_letter_sub:'Write from the heart',
    home_hl:'Write it down.',home_lede:'Daily blogs, sticky notes and real letters you can print and post. Pick up a pen, or a phone.',
    streak_empty:'Write something today to start your streak.',streak_day:'day streak',streak_nudge:'Write a little today',
    prompt_eyebrow:"Today's prompt",prompt_blog:'Write about it',prompt_next:'Another prompt',
    door_blog_title:'Read the blog',door_blog_desc:'A new post every day. Read it, or write your own.',
    door_notes_title:'Stick a note',door_notes_desc:'Three lines on a coloured sticky. Put it on the wall.',
    door_letter_title:'Write a letter',door_letter_desc:'Pick your paper, then print it.',
    door_open:'Open →',door_dear:'Dear you,',
    blog_title:'The Daily Blog',blog_sub:'One post a day. Read, or write your own.',
    write_today:"Write today's post",search_placeholder:'Search posts',edit_post_title:'Edit post',
    filter_all:'All',filter_hide:'Hide sample posts',filter_journal:'Journal',filter_letters:'Letters',filter_ideas:'Ideas',filter_notes:'Notes',
    label_title:'Title',title_placeholder:"What is today's post about?",label_topic:'Topic',label_post:'Post',
    post_placeholder:'Write until the tea gets cold. Leave a blank line between paragraphs.',
    publish_btn:'Save post',save_changes_btn:'Save changes',close_btn:'Close',
    draft_saved_hint:'Only you can see your posts. Nothing is shared. Your draft saves as you type.',
    all_posts_btn:'← All posts',copy_post:'Copy text',share_card:'Share card',share_btn:'Share',
    download_pdf:'Download PDF',print_btn:'Print',edit_post:'Edit post',delete_post:'Delete post',
    confirm_delete:'Tap again to delete',no_posts:'No posts match. Try another word or topic.',
    post_singular:'post',posts_plural:'posts',min_read:'min read',word:'word',words:'words',about:'about',
    notes_title:'Sticky Notes',notes_sub:'Three lines are enough.',note_label:'Your note',
    note_placeholder:'Say something kind, funny or true.',signed_label:'Signed',signed_placeholder:'Your name (optional)',
    colour_label:'Colour',stick_it_btn:'Stick it',
    notes_hint:'The first four are examples. Delete them or add your own. Tap <b>Save image</b> on a note for a 3000 × 3000 PNG.',
    empty_wall:'The wall is empty. Stick the first note above.',save_image:'Save image',delete_note:'Delete note',
    letter_title:'Write a Letter',letter_sub:'Pick your paper, write it out, print it.',need_start:'Need a start?',
    greet_label:'To',letter_body_label:'Your letter',letter_placeholder:'Start with what you really want to say.',
    sign_label:'Sign-off',from_label:'Your name',date_label:'Date',style_label:'Writing style',
    style_hand:'Handwritten look',style_typed:'Clean print',paper_label:'Paper',deco_label:'Decoration',
    ruled_lines:'Ruled lines',download_png:'Download PNG',new_letter:'New letter',
    clear_letter_confirm:'Tap again to clear',
    letter_info:'PDF and PNG are full-page A4 at 300 dpi, with no white border. A long letter becomes one PNG per page, or one PDF with all pages. Print is best when you have a printer.',
    a4_preview:'A4 preview',occasion_label:'Occasion',zen_btn:'☾ Zen mode',zen_exit:'Exit zen',zen_done:'Done',more_themes:'More',less:'Less',page_options:'Page options',more_btn:'More',f_data:'Your data',letter_info_short:'Full-page A4 · 300 dpi · no white border',starter_next:'Another start',starter_aai:'Aai letter example',starter_aai_greet:'Dear Aai,',starter_aai_body:'I do not say this often enough, but I notice all the little things you do for me. When you ask if I have eaten, save the best piece for me, or stay up until I get home, I feel loved in a hundred quiet ways.\n\nThank you for making even ordinary days feel safe. I may be growing up, but I will always need your warmth, your advice, and the sound of you calling me home.\n\nI love you, Aai. I hope I make you proud, and I hope you know how much I carry your love with me wherever I go.',starter_aai_sign:'With all my love,',starter_aai_replace:'Replace this letter with the complete Aai example?',preview_placeholder:'Your letter appears here as you type…',
    why_eyebrow:'Why UNWRITTEN exists',why_title:'A companion to your notebook, never a replacement.',
    why_p1:'Notebooks and journals matter. The pen, the paper, the slower pace of handwriting: UNWRITTEN does not try to take any of that away.',
    why_p2:'But some days the notebook is not with you. You are on a bus, in a queue, away from home, or a thought turns up at midnight and your bag is across the room. UNWRITTEN is a place for that thought to land, so it is still there when you get back to your pages.',
    why_w1_t:'On the move',why_w1_d:'Bus, train or a long wait. Jot it here and carry on.',
    why_w2_t:'No pen in reach',why_w2_d:'The idea will not wait. Type it and keep it.',
    why_w3_t:'Back at your desk',why_w3_d:'Copy it into your notebook, or print it and paste it in.',
    why_guide_title:'Use it with your notebook',
    why_step1:'<b>Catch it here</b> when paper is out of reach.',why_step2:'<b>Save it</b> as a PNG, or print it as a PDF.',why_step3:'<b>Rewrite it by hand</b> in your journal when you can. That keeps the habit going.',
    how_blog:'<b>Normal:</b> pick a topic, write, save. <b>Zen:</b> just you and the page. Zero noise.',how_letter:'<b>Normal:</b> pick your paper and vibe, then print. <b>Zen:</b> just you and the page. Zero noise.',fact_title:'Scroll less, write a little',fact1:'<b>Scrolling</b> fills your head with other people’s thoughts. Writing gives you yours back.',fact2:'<b>Putting a feeling into words</b> tends to make it feel smaller. Researchers call this affect labelling.',fact3:'<b>Studies</b> link long stretches of doomscrolling with more stress, and expressive writing with a slightly better mood.',fact_note:'Just research, not medical advice. A few lines a day is plenty.',why_privacy:'Your writing stays on this device. If you sign in, it is saved to your own private account and shown to no one else.',
    login_title:'Welcome back',signup_title:'Create your account',login_sub:'Sign in to keep your writing safe and see it on every device.',login_google:'Continue with Google',login_or:'or use your email',login_email:'Email',login_pass:'Password',login_signin:'Sign in',signup_go:'Create account',login_to_signup:'New here? Create an account',login_to_signin:'Already have an account? Sign in',login_forgot:'Forgot password?',login_guest:'Continue without an account',login_privacy:'Your writing is saved to your own private account. Signing out removes it from this device.',f_signin:'Sign in',f_signout:'Sign out',f_signout_confirm:'Tap again to sign out',acct_as:'Signed in as ',sync_saved:'Saved to your account',sync_wait:'Syncing…',sync_off:'Offline. Will sync later',err_creds:'Wrong email or password.',err_exists:'An account with this email already exists. Try signing in.',err_weak:'Use a password with at least 8 characters.',err_email:'Please enter a valid email.',err_many:'Too many tries. Please wait a little and try again.',err_net:'No internet. Please check your connection.',err_popup:'The pop-up was blocked. Allow pop-ups or use your email.',err_generic:'Something went wrong. Please try again.',reset_sent:'Password reset link sent to your email.',need_email:'Type your email above first.',offline_login:'You need internet to sign in.',
    profile_open:'Open profile',profile_close:'Close profile',profile_title:'Your profile',profile_help:'A little about your UNWRITTEN account.',profile_name:'Display name',profile_name_placeholder:'Your name',profile_photo:'Profile photo URL',profile_photo_placeholder:'https://…',profile_photo_error:'Use an https image address or a file on this site.',profile_save:'Save profile',profile_saving:'Saving…',profile_saved:'Your profile was saved.',profile_name_required:'Please add a name first.',profile_save_error:'Could not save your profile. Please try again.',profile_offline:'Profile settings need an internet connection.',profile_posts:'posts',profile_notes:'notes',profile_days:'writing days',profile_activity:'Writing activity',profile_privacy:'Your writing is private to your account. Signing out removes its copy from this device.',profile_reset:'Reset password',
    streak_total:'{n} days written',counts:'That counts. {n} days written so far.',keep_safe:'Saved on this device. Sign in to keep it safe on every device.',saved_ok:'saved',
    f_privacy:'Privacy',privacy_title:'Privacy, in plain words',privacy_close:'Close',privacy_link:'Privacy',
    privacy_p1:'If you do not sign in, everything you write stays in this browser and goes nowhere.',
    privacy_p2:'If you sign in, we keep your email and four things: your posts, notes, letter and writing days. Nothing else. No ads and no trackers.',
    privacy_p3:'They are stored with Google Firebase. The rules let only your own account read your writing. The person who runs UNWRITTEN can technically open the database for maintenance, but does not read or share your writing.',
    privacy_p4:'You are in control. Sign out removes it all from this device. Erase everything also deletes your saved copy. Delete account in your profile removes your account and its data.',
    pw_show:'Show',pw_hide:'Hide',signing_in:'Signing in…',creating:'Creating account…',welcome_in:'Welcome, ',
    profile_delete:'Delete account',profile_delete_confirm:'Tap again to delete your account and its data',err_recent:'For safety, please sign out, sign in again, then delete your account.',
    starter_preview_caption:'A sample letter to Aai. Start writing to make it yours.',
    tagline:'Write a little, every day.',
    f_why:'Why UNWRITTEN',f_backup:'Backup (JSON)',f_text:'Readable copy (.txt)',f_restore:'Restore backup',
    f_install:'Install app',f_erase:'Erase everything',f_erase_confirm:'Tap again to erase everything',f_top:'Back to top ↑',
    toast_copied:'Post copied',toast_deleted:'Post deleted',toast_published:'Post saved',toast_saved:'Changes saved',
    toast_note_saved:'Note image saved',toast_note_stuck:'Note stuck on the wall',toast_letter_copied:'Letter copied',
    toast_fresh_ready:'Fresh page ready',toast_pdf_saved:'PDF saved',toast_img_saved:'Letter image saved',
    toast_making_img:'Making your image…',toast_making_pdf:'Making your PDF…',toast_making_card:'Making share card…',
    toast_card_saved:'Share card saved',toast_backup_saved:'Backup saved',toast_txt_saved:'Readable copy saved',
    toast_fill_first:'Add a title and some words first',toast_write_first:'Write something first'
  },
  mr:{
    nav_home:'मुख्य पान',nav_blog:'ब्लॉग',nav_notes:'चिट्ठ्या',nav_letter:'पत्र',
    nav_home_sub:'तुमचा लेखनाचा कट्टा',nav_blog_sub:'आजची गोष्ट सांगा',nav_notes_sub:'छोटा विचार लिहून ठेवा',nav_letter_sub:'मनापासून लिहा',
    home_hl:'लिहून काढा.',home_lede:'दैनंदिन ब्लॉग, चिट्ठ्या आणि खरीखुरी पत्रे. पेन उचला, किंवा फोन.',
    streak_empty:'आज काहीतरी लिहून सातत्य सुरू करा.',streak_day:'दिवसांचे सातत्य',streak_nudge:'आज थोडं लिहा',
    prompt_eyebrow:'आजचा विचार',prompt_blog:'यावर लिहा',prompt_next:'दुसरा विचार',
    door_blog_title:'ब्लॉग वाचा',door_blog_desc:'रोज एक नवा विचार. वाचा, किंवा स्वतः लिहा.',
    door_notes_title:'चिट्ठी लावा',door_notes_desc:'रंगीत कागदावर तीन ओळी. भिंतीवर चिकटवा.',
    door_letter_title:'पत्र लिहा',door_letter_desc:'कागद निवडा आणि प्रिंट करा.',
    door_open:'उघडा →',door_dear:'प्रिय तुम्ही,',
    blog_title:'दैनिक ब्लॉग',blog_sub:'दररोज एक विचार. वाचा किंवा स्वतः लिहा.',
    write_today:'आजचा ब्लॉग लिहा',search_placeholder:'ब्लॉग शोधा',edit_post_title:'ब्लॉग संपादित करा',
    filter_all:'सर्व',filter_hide:'उदाहरणे लपवा',filter_journal:'रोजनीशी',filter_letters:'पत्रे',filter_ideas:'कल्पना',filter_notes:'नोंदी',
    label_title:'शीर्षक',title_placeholder:'आजचा ब्लॉग कशाबद्दल आहे?',label_topic:'विषय',label_post:'मजकूर',
    post_placeholder:'चहा गार होईपर्यंत लिहा. परिच्छेदांमध्ये एक ओळ रिकामी सोडा.',
    publish_btn:'ब्लॉग जतन करा',save_changes_btn:'बदल जतन करा',close_btn:'बंद करा',
    draft_saved_hint:'तुमचे ब्लॉग फक्त तुम्हीच पाहू शकता. काहीही शेअर होत नाही. लिहिताना मसुदा आपोआप जतन होतो.',
    all_posts_btn:'← सर्व ब्लॉग',copy_post:'मजकूर कॉपी करा',share_card:'कार्ड शेअर करा',share_btn:'शेअर करा',
    download_pdf:'PDF डाउनलोड',print_btn:'प्रिंट करा',edit_post:'संपादित करा',delete_post:'हटवा',
    confirm_delete:'हटवण्यासाठी पुन्हा दाबा',no_posts:'काही सापडले नाही. दुसरा शब्द शोधून पहा.',
    post_singular:'ब्लॉग',posts_plural:'ब्लॉग',min_read:'मि. वाचन',word:'शब्द',words:'शब्द',about:'सुमारे',
    notes_title:'रंगीत चिट्ठ्या',notes_sub:'तीन ओळी पुरेशा आहेत.',note_label:'तुमची चिट्ठी',
    note_placeholder:'काहीतरी गोड, गमतीशीर किंवा खरं लिहा.',signed_label:'नाव',signed_placeholder:'तुमचे नाव (ऐच्छिक)',
    colour_label:'रंग',stick_it_btn:'चिकटवा',
    notes_hint:'पहिली चार उदाहरणे आहेत. ती हटवा किंवा स्वतःची जोडा. ३०००×३००० चित्रासाठी <b>Save image</b> दाबा.',
    empty_wall:'भिंत रिकामी आहे. वर पहिली चिट्ठी चिकटवा.',save_image:'चित्र जतन करा',delete_note:'चिट्ठी हटवा',
    letter_title:'पत्र लिहा',letter_sub:'कागद निवडा, मनातलं लिहा, प्रिंट करा.',need_start:'सुरुवात हवी आहे?',
    greet_label:'संबोधन',letter_body_label:'पत्राचा मजकूर',letter_placeholder:'जे मनापासून सांगायचं आहे तिथून सुरुवात करा.',
    sign_label:'शेवट',from_label:'आपला/आपली',date_label:'दिनांक',style_label:'लेखन शैली',
    style_hand:'हस्ताक्षर शैली',style_typed:'स्वच्छ मुद्रण',paper_label:'कागद',deco_label:'सजावट',
    ruled_lines:'रेघांचा कागद',download_png:'PNG डाउनलोड',new_letter:'नवीन पत्र',
    clear_letter_confirm:'कोरे करण्यासाठी पुन्हा दाबा',
    letter_info:'PDF आणि PNG संपूर्ण A4 पानावर ३०० dpi मध्ये बिना पांढऱ्या कडांचे मिळतात.',
    a4_preview:'A4 पूर्वावलोकन',occasion_label:'प्रसंग',zen_btn:'☾ झेन मोड',zen_exit:'झेन बंद करा',zen_done:'झाले',more_themes:'आणखी',less:'कमी',page_options:'पानाचे पर्याय',more_btn:'आणखी',f_data:'तुमचा डेटा',letter_info_short:'पूर्ण A4 पान · ३०० dpi · पांढऱ्या कडा नाहीत',starter_next:'दुसरी सुरुवात',starter_aai:'आईसाठी नमुना पत्र',starter_aai_greet:'प्रिय आई,',starter_aai_body:'आई, तुझ्यासाठी मनातलं कितीदा सांगायचं राहून जातं. जेवण झालं का हे विचारणं, माझ्यासाठी आवडती गोष्ट जपून ठेवणं किंवा मी घरी येईपर्यंत जागं राहणं — तुझ्या या छोट्या गोष्टींतून मला तुझं प्रेम रोज जाणवतं.\n\nसाध्या दिवसांनाही आपुलकीची ऊब दिल्याबद्दल धन्यवाद. वय वाढत गेलं तरी तुझा सल्ला, तुझी माया आणि घरी आल्यावर ऐकू येणारी तुझी हाक मला नेहमीच हवीशी वाटेल.\n\nआई, माझं तुझ्यावर खूप प्रेम आहे. तुला माझा अभिमान वाटावा अशी माझी इच्छा आहे; आणि तू दिलेलं प्रेम मी जिथे जाईन तिथे सोबत घेऊन जातो, हे तुला कळावं असंही वाटतं.',starter_aai_sign:'खूप साऱ्या प्रेमाने,',starter_aai_replace:'सध्याचे पत्र बदलून आईसाठीचा पूर्ण नमुना वापरायचा?',preview_placeholder:'तुम्ही लिहिता तसे पत्र इथे दिसेल…',
    why_eyebrow:'UNWRITTEN का अस्तित्वात आहे?',why_title:'डायरीची सोबत, डायरीला पर्याय नाही.',
    why_p1:'वही आणि डायरीचे महत्त्व वेगळेच आहे. पेन, कागद आणि लिहिण्याची संथ लय — UNWRITTEN ती हिरावून घेत नाही.',
    why_p2:'पण काही वेळा डायरी सोबत नसते. बसमध्ये, रांगेत, किंवा मध्यरात्री एखादा विचार येतो आणि बॅग दूर असते. त्या वेळी विचारांना सामावून घेण्यासाठी UNWRITTEN आहे.',
    why_w1_t:'प्रवासात असताना',why_w1_d:'बस, ट्रेन किंवा वाट पाहताना. पटकन लिहा.',
    why_w2_t:'पेन हाताशी नसताना',why_w2_d:'विचार थांबत नाही. इथे टाईप करून ठेवा.',
    why_w3_t:'घरी आल्यावर',why_w3_d:'डायरीमध्ये हाताने लिहून काढा किंवा प्रिंट करून चिकटवा.',
    why_guide_title:'डायरीसोबत कसे वापरावे?',
    why_step1:'कागद उपलब्ध नसेल तेव्हा <b>इथे टिपून घ्या</b>.',why_step2:'<b>PNG किंवा PDF</b> स्वरूपात जतन करा.',why_step3:'वेळ मिळेल तेव्हा डायरीत <b>हाताने लिहा</b>.',
    how_blog:'<b>नॉर्मल:</b> विषय निवडा, लिहा, जतन करा. <b>झेन:</b> फक्त तुम्ही आणि पान. शून्य गोंधळ.',how_letter:'<b>नॉर्मल:</b> कागद आणि मूड निवडा, मग प्रिंट करा. <b>झेन:</b> फक्त तुम्ही आणि पान. शून्य गोंधळ.',fact_title:'स्क्रोल कमी, लिहा थोडं',fact1:'<b>स्क्रोलिंग</b> डोक्यात इतरांचे विचार भरतं. लिहिल्याने तुमचे स्वतःचे विचार परत मिळतात.',fact2:'<b>भावना शब्दांत मांडली</b> की ती छोटी वाटू लागते. संशोधक याला affect labelling म्हणतात.',fact3:'<b>अभ्यासांनुसार</b> जास्त वेळ दुःखद बातम्या स्क्रोल केल्याने ताण वाढतो, आणि मनातलं लिहिल्याने मूड थोडा सुधारतो.',fact_note:'हे फक्त संशोधन आहे, वैद्यकीय सल्ला नव्हे. रोज थोड्या ओळी पुरेशा आहेत.',why_privacy:'तुमचे लिखाण याच उपकरणावर राहते. साइन इन केल्यास ते तुमच्या स्वतःच्या खाजगी खात्यात साठवले जाते आणि दुसऱ्या कुणालाही दिसत नाही.',
    login_title:'पुन्हा स्वागत',signup_title:'खाते तयार करा',login_sub:'तुमचे लिखाण सुरक्षित ठेवण्यासाठी आणि सर्व उपकरणांवर पाहण्यासाठी साइन इन करा.',login_google:'Google ने पुढे जा',login_or:'किंवा ईमेल वापरा',login_email:'ईमेल',login_pass:'पासवर्ड',login_signin:'साइन इन',signup_go:'खाते तयार करा',login_to_signup:'नवीन आहात? खाते तयार करा',login_to_signin:'आधीच खाते आहे? साइन इन करा',login_forgot:'पासवर्ड विसरलात?',login_guest:'खात्याशिवाय पुढे जा',login_privacy:'तुमचे लिखाण तुमच्या स्वतःच्या खाजगी खात्यात साठवले जाते. साइन आउट केल्यावर ते या उपकरणातून काढले जाते.',f_signin:'साइन इन',f_signout:'साइन आउट',f_signout_confirm:'साइन आउटसाठी पुन्हा टॅप करा',acct_as:'साइन इन: ',sync_saved:'खात्यात जतन झाले',sync_wait:'समक्रमित होत आहे…',sync_off:'ऑफलाइन. नंतर समक्रमित होईल',err_creds:'ईमेल किंवा पासवर्ड चुकीचा आहे.',err_exists:'या ईमेलचे खाते आधीच आहे. साइन इन करा.',err_weak:'पासवर्ड किमान ८ अक्षरांचा ठेवा.',err_email:'कृपया योग्य ईमेल लिहा.',err_many:'खूप प्रयत्न झाले. थोड्या वेळाने पुन्हा करा.',err_net:'इंटरनेट नाही. कनेक्शन तपासा.',err_popup:'पॉप-अप अडवला गेला. परवानगी द्या किंवा ईमेल वापरा.',err_generic:'काहीतरी चुकले. पुन्हा प्रयत्न करा.',reset_sent:'पासवर्ड रीसेटची लिंक ईमेलवर पाठवली.',need_email:'आधी वरती ईमेल लिहा.',offline_login:'साइन इन करण्यासाठी इंटरनेट हवे.',
    profile_open:'प्रोफाइल उघडा',profile_close:'प्रोफाइल बंद करा',profile_title:'तुमचे प्रोफाइल',profile_help:'तुमच्या UNWRITTEN खात्याची थोडी माहिती.',profile_name:'दिसणारे नाव',profile_name_placeholder:'तुमचे नाव',profile_photo:'प्रोफाइल फोटोची लिंक',profile_photo_placeholder:'https://…',profile_photo_error:'https लिंक किंवा या साइटवरील फोटो वापरा.',profile_save:'प्रोफाइल जतन करा',profile_saving:'जतन होत आहे…',profile_saved:'तुमचे प्रोफाइल जतन झाले.',profile_name_required:'कृपया आधी नाव लिहा.',profile_save_error:'प्रोफाइल जतन झाले नाही. पुन्हा प्रयत्न करा.',profile_offline:'प्रोफाइल बदलण्यासाठी इंटरनेट कनेक्शन आवश्यक आहे.',profile_posts:'ब्लॉग',profile_notes:'चिठ्ठ्या',profile_days:'लेखनाचे दिवस',profile_activity:'लेखनाची माहिती',profile_privacy:'तुमचे लिखाण तुमच्या खात्यात खाजगी राहते. साइन आउट केल्यावर त्याची प्रत या उपकरणातून काढली जाते.',profile_reset:'पासवर्ड रीसेट करा',
    streak_total:'{n} दिवस लिहिले',counts:'ते मोजले गेले. आतापर्यंत {n} दिवस लिहिले.',keep_safe:'या डिव्हाइसवर जतन केले. सर्व डिव्हाइसवर सुरक्षित ठेवण्यासाठी साइन इन करा.',saved_ok:'जतन झाले',
    f_privacy:'गोपनीयता',privacy_title:'गोपनीयता, सोप्या शब्दांत',privacy_close:'बंद करा',privacy_link:'गोपनीयता',
    privacy_p1:'तुम्ही साइन इन केले नाही, तर तुम्ही लिहिलेले सर्व याच ब्राउझरमध्ये राहते आणि कुठेही जात नाही.',
    privacy_p2:'साइन इन केल्यास आम्ही तुमचा ईमेल आणि चार गोष्टी ठेवतो: पोस्ट, नोट्स, पत्र आणि लिहिलेले दिवस. आणखी काही नाही. जाहिराती नाहीत, ट्रॅकर्स नाहीत.',
    privacy_p3:'हे Google Firebase मध्ये साठवले जाते. नियमांनुसार फक्त तुमचेच खाते तुमचे लिखाण वाचू शकते. UNWRITTEN चालवणारी व्यक्ती देखभालीसाठी डेटाबेस तांत्रिकदृष्ट्या उघडू शकते, पण तुमचे लिखाण वाचत नाही किंवा कुणाला देत नाही.',
    privacy_p4:'नियंत्रण तुमचे आहे. साइन आउट केल्यावर सर्व काही या उपकरणातून निघते. सर्व हटवा दिल्यास साठवलेली प्रतही हटते. प्रोफाइलमधील खाते हटवा दिल्यास खाते आणि त्याचा डेटा हटतो.',
    pw_show:'दाखवा',pw_hide:'लपवा',signing_in:'साइन इन होत आहे…',creating:'खाते तयार होत आहे…',welcome_in:'स्वागत, ',
    profile_delete:'खाते हटवा',profile_delete_confirm:'खाते आणि डेटा हटवण्यासाठी पुन्हा टॅप करा',err_recent:'सुरक्षिततेसाठी, कृपया साइन आउट करून पुन्हा साइन इन करा, मग खाते हटवा.',
    starter_preview_caption:'आईसाठीचे नमुना पत्र. लिहायला सुरुवात करा आणि ते तुमचे बनवा.',
    tagline:'दररोज थोडे, मनापासून लिहा.',
    f_why:'UNWRITTEN बद्दल',f_backup:'बॅकअप (JSON)',f_text:'वाचनीय प्रत (.txt)',f_restore:'बॅकअप पूर्ववत करा',
    f_install:'अॅप इंस्टॉल करा',f_erase:'सर्व हटवा',f_erase_confirm:'सर्व हटवण्यासाठी पुन्हा दाबा',f_top:'वर जा ↑',
    toast_copied:'मजकूर कॉपी केला',toast_deleted:'ब्लॉग हटवला',toast_published:'ब्लॉग जतन केला',toast_saved:'बदल जतन केले',
    toast_note_saved:'चिट्ठी जतन केली',toast_note_stuck:'चिट्ठी भिंतीवर चिकटवली',toast_letter_copied:'पत्र कॉपी केले',
    toast_fresh_ready:'नवे पान तयार आहे',toast_pdf_saved:'PDF जतन झाली',toast_img_saved:'चित्र जतन झाले',
    toast_making_img:'चित्र तयार करत आहे…',toast_making_pdf:'PDF तयार करत आहे…',toast_making_card:'शेअर कार्ड तयार करत आहे…',
    toast_card_saved:'शेअर कार्ड जतन झाले',toast_backup_saved:'बॅकअप जतन झाला',toast_txt_saved:'वाचनीय प्रत जतन झाली',
    toast_fill_first:'आधी शीर्षक आणि काही शब्द लिहा',toast_write_first:'आधी काहीतरी लिहा'
  }
};
let curLang=store.get(K.lang)||'en';
function t(k,fb=''){
  const dict=I18N[curLang]||I18N.en;
  if(dict&&dict[k])return dict[k];
  if(I18N.en&&I18N.en[k])return I18N.en[k];
  console.warn('Missing i18n key:',k);
  return fb||k;
}
window.LihaT=t;
function applyLang(lang){
  curLang=lang==='mr'?'mr':'en';
  document.documentElement.lang=curLang;
  $$('[data-i18n]').forEach(el=>{
    const k=el.dataset.i18n;
    if(!k)return;
    /* data-i18n-html: dictionary strings are our own, so <b> is safe to keep */
    if(el.hasAttribute('data-i18n-html'))el.innerHTML=t(k,el.innerHTML);
    else el.textContent=t(k,el.textContent);
  });
  $$('[data-i18n-ph]').forEach(el=>{
    const k=el.dataset.i18nPh;
    if(k)el.setAttribute('placeholder',t(k,el.getAttribute('placeholder')));
  });
  $$('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria,el.getAttribute('aria-label')||'')));
  const fl=$('#f-lang');if(fl)fl.textContent=curLang==='mr'?'English':'मराठी';
  renderThemes();renderStarter();letterCount();renderLetter();
  updateFilters();
  renderStreak();
  renderWall();
  route();
}

/* ---------- theme / night mode (Phase 5) ---------- */
const THEME={home:'#FF6A18',blog:'#1F6FE0',notes:'#FF4A5C',letter:'#6578EC'};
const THEME_DARK={home:'#9E3700',blog:'#0F3A80',notes:'#8C1C28',letter:'#2E3A82'};
function isDark(){return document.documentElement.dataset.theme==='dark'}
function applyTheme(dark){
  document.documentElement.dataset.theme=dark?'dark':'light';
  const ti=$('#theme-icon');if(ti)ti.textContent=dark?'☼':'☾';
  const tb=$('#theme-btn');if(tb)tb.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');
  let p=location.hash.slice(1);if(!PAGES.includes(p))p='home';
  $('#theme-color').content=dark?THEME_DARK[p]:THEME[p];
}
function initTheme(){                         /* bright by default; night mode only if the person picked it */
  applyTheme(store.get(K.theme)==='dark');
}

/* ---------- pages and the pop-up menu ---------- */
const PAGES=['home','blog','notes','letter'];
const LABEL={home:'Home',blog:'Blog',notes:'Notes',letter:'Letters'};
const navBtn=$('#navbtn'),menu=$('#menu'),scrim=$('#scrim');
const menuItems=()=>$$('.m-item',menu);
function setMenu(open,restoreFocus){
  menu.classList.toggle('open',open);
  scrim.classList.toggle('open',open);
  navBtn.setAttribute('aria-expanded',String(open));
  if(!open&&restoreFocus)navBtn.focus();
}
navBtn.addEventListener('click',()=>{
  const open=!menu.classList.contains('open');
  setMenu(open);
  if(open)requestAnimationFrame(()=>(menuItems().find(a=>a.getAttribute('aria-current')==='page')||menuItems()[0]).focus());
});
scrim.addEventListener('click',()=>setMenu(false));
menu.addEventListener('click',e=>{if(e.target.closest('.m-item'))setMenu(false)});
addEventListener('keydown',e=>{
  if(!menu.classList.contains('open'))return;
  if(e.key==='Escape'){setMenu(false,true);return}
  const list=menuItems(),i=list.indexOf(document.activeElement),go=d=>{e.preventDefault();list[(i+d+list.length)%list.length].focus()};
  if(e.key==='ArrowRight'||e.key==='ArrowDown')go(1);
  else if(e.key==='ArrowLeft'||e.key==='ArrowUp')go(-1);
  else if(e.key==='Tab'){
    const ring=[navBtn,...list],k=ring.indexOf(document.activeElement);
    e.preventDefault();ring[(k+(e.shiftKey?-1:1)+ring.length)%ring.length].focus();
  }
});
function route(){
  let p=location.hash.slice(1);
  if(!PAGES.includes(p))p='home';
  document.body.dataset.page=p;
  PAGES.forEach(n=>{$('#page-'+n).hidden=n!==p});
  menuItems().forEach(a=>a.dataset.page===p?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'));
  $('#navlabel').textContent=t('nav_'+p,LABEL[p]);
  $('#theme-color').content=isDark()?THEME_DARK[p]:THEME[p];
  setMenu(false);
  /* leaving a page closes its zen box */
  if(p!=='letter'&&zens.l)zens.l(false);
  if(p!=='blog'&&zens.p)zens.p(false);
  window.scrollTo(0,0);
}
addEventListener('hashchange',route);

/* ---------- daily prompt ---------- */
const PROMPTS=[
 'Write three lines to someone you miss.',
 'Describe your day in five words, then explain each one.',
 'What did you learn this week that nobody taught you?',
 'Write a thank-you note to a place, not a person.',
 'A smell takes you back. Where does it take you?',
 'Say sorry to someone, even if only on paper.',
 'What would you tell yourself at age ten?',
 'Write about the last meal that made you happy.',
 'Describe your street at six in the morning.',
 'Name one small thing you are proud of this month.',
 'Write to yourself, one year from today.',
 'Who always makes time for you? Tell them.',
 'Three things you want to remember about this year.',
 'Describe a sound from your childhood home.'
];
const dayOfYear=Math.floor((Date.now()-new Date(new Date().getFullYear(),0,0))/864e5);
let pi=dayOfYear%PROMPTS.length;
const showPrompt=()=>{$('#prompt-text').textContent=PROMPTS[pi]};
$('#prompt-next').addEventListener('click',()=>{pi=(pi+1)%PROMPTS.length;showPrompt()});

/* ---------- writing streak ---------- */
let days=new Set((Array.isArray(parse(store.get(K.days),[]))?parse(store.get(K.days),[]):[]).filter(isDay));
function streakCount(){                       /* one free rest day a week keeps the streak alive */
  const d=new Date();
  if(!days.has(keyOf(d)))d.setDate(d.getDate()-1);
  const at=k=>{const x=new Date(d);x.setDate(x.getDate()-k);return days.has(keyOf(x))};
  let n=0,rest=-99;
  for(let i=0;i<400;i++){
    if(at(i))n++;
    else if(i-rest>=7&&at(i+1))rest=i;
    else break;
  }
  return n;
}
function renderStreak(){
  const n=streakCount(),week=[];
  for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);week.push({d,today:i===0})}
  const done=week.filter(w=>days.has(keyOf(w.d))).length;
  const needNudge=n>0&&!days.has(todayISO());
  $('#streak').replaceChildren(...[
    n?h('div',{class:'streak-n'},h('b',{},String(n)),h('span',{},t('streak_day','day streak'))):h('p',{class:'streak-empty'},t('streak_empty','Write something today to start your streak.')),
    h('div',{class:'week',role:'img','aria-label':done+' of the last 7 days written'},
      week.map(w=>h('span',{class:'wd'+(days.has(keyOf(w.d))?' on':'')+(w.today?' today':'')},w.d.toLocaleDateString('en-GB',{weekday:'narrow'})))),
    days.size?h('span',{class:'streak-total'},t('streak_total','{n} days written').replace('{n}',days.size)):null,
    needNudge?h('button',{class:'streak-nudge',type:'button',onclick:()=>{location.hash='#notes';setTimeout(()=>$('#n-text').focus(),120)}},h('span',{},t('streak_nudge','Write a little today'))):null
  ].filter(Boolean));
}
let cheered='';
function cheer(){                             /* a kind word, once a day, after the action's own message */
  const d=todayISO();if(cheered===d)return;cheered=d;
  const c=window.LIHA_FIREBASE||{},guest=c.apiKey&&!/^PASTE/.test(c.apiKey)&&!store.get('liha.uid');
  setTimeout(()=>toast(guest?t('keep_safe','Saved on this device. Sign in to keep it safe on every device.'):t('counts','That counts. {n} days written so far.').replace('{n}',days.size)),2900);
}
function markToday(quiet){
  const d=todayISO();
  if(!days.has(d)){days.add(d);store.set(K.days,JSON.stringify([...days].sort().slice(-400)));renderStreak()}
  if(!quiet)cheer();
}

/* ---------- blog ---------- */
const TAGS={journal:'Journal',letters:'Letters',ideas:'Ideas',notes:'Notes'};
const SAMPLES=[
 {id:'s1',sample:true,tag:'journal',date:'2026-10-27',title:'Day 1: why I write every day',
  body:"I spend hours reading other people's thoughts and almost no time writing my own. So from today, one post a day. No perfect drafts, no waiting for the right idea.\n\nThe rule is small. Open the page, write until the tea gets cold, hit publish. If the day was boring, I will write about why it was boring.\n\nIf you are reading this, maybe write something too. A note on the wall, a letter to a friend. Start small, start today."},
 {id:'s2',sample:true,tag:'letters',date:'2026-10-26',title:'A letter nobody sent',
  body:"Found an old letter in a school notebook last week. It was an apology to a friend. The ink had faded but the sorry was still clear.\n\nIt never got sent. Saying sorry out loud felt harder than any exam. Now I think writing it was the brave part.\n\nWriting slows you down just enough to say what you mean. A message takes ten seconds. A letter takes ten minutes, and that is exactly why it lands."},
 {id:'s3',sample:true,tag:'notes',date:'2026-10-25',title:'Three-line notes that make a day',
  body:"A sticky note on a laptop. A line on a tiffin box. A proud-of-you on the bathroom mirror.\n\nShort notes work because nobody has to reply. They just sit there and be kind.\n\nTry one today. Write three lines, stick them somewhere, and walk away."}
];
function cleanPost(p){
  if(!p||typeof p!=='object'||typeof p.title!=='string'||typeof p.body!=='string')return null;
  return{id:str(p.id,40)||'p'+Math.random().toString(36).slice(2,9),tag:TAGS[p.tag]?p.tag:'ideas',date:isDay(p.date)?p.date:todayISO(),
    title:str(p.title,80),body:str(p.body,20000),edited:p.edited===true};
}
const loadList=(key,fn)=>{const v=parse(store.get(key),[]);return Array.isArray(v)?v.map(fn).filter(Boolean):[]};
let mine=loadList(K.posts,cleanPost);
let openId=null,confirmDel=false,editingId=null,filter='all',query='',hideSamples=store.get(K.hide)==='1';
const savePosts=()=>store.set(K.posts,JSON.stringify(mine));
const allPosts=()=>[...mine,...(hideSamples?[]:SAMPLES)].sort((a,b)=>b.date.localeCompare(a.date));
const words=t=>(t.trim().match(/\S+/g)||[]).length;
const readMins=b=>Math.max(1,Math.round(words(b)/180));
const excerpt=b=>{const t=b.replace(/\s+/g,' ').trim();return t.length>130?t.slice(0,127).trimEnd()+'…':t};

const filterBtns=[];
(function buildFilters(){
  const mk=(key,label,cls='')=>{
    const b=h('button',{class:'fchip '+cls,type:'button',onclick:()=>{
      if(key==='hide'){hideSamples=!hideSamples;hideSamples?store.set(K.hide,'1'):store.del(K.hide)}else filter=key;
      renderBlog();
    }},label);
    b.dataset.key=key;filterBtns.push(b);return b;
  };
  $('#filters').replaceChildren(mk('all','All'),...Object.entries(TAGS).map(([k,v])=>mk(k,v)),mk('hide','Hide sample posts','quiet'));
})();
function updateFilters(){
  filterBtns.forEach(b=>{
    const k=b.dataset.key;
    b.setAttribute('aria-pressed',String(k==='hide'?hideSamples:k===filter));
    if(k==='all')b.textContent=t('filter_all','All');
    else if(k==='hide')b.textContent=t('filter_hide','Hide sample posts');
    else if(TAGS[k])b.textContent=t('filter_'+k,TAGS[k]);
  });
}
function renderBlog(){
  const reader=$('#blog-reader'),list=$('#blog-list');
  const p=allPosts().find(x=>x.id===openId);
  if(p){
    list.hidden=true;reader.hidden=false;
    reader.replaceChildren(
      h('button',{class:'btn ghost',type:'button',onclick:()=>{openId=null;confirmDel=false;renderBlog();window.scrollTo(0,0)}},t('all_posts_btn','← All posts')),
      h('div',{style:'margin-top:20px'},h('span',{class:'tag'},t('filter_'+p.tag,TAGS[p.tag]))),
      h('h2',{},p.title),
      h('p',{class:'meta'},fmt(p.date)+' · '+readMins(p.body)+' '+t('min_read','min read')+(p.sample?' · Sample':'')+(p.edited?' · Edited':'')),
      h('hr',{class:'dash'}),
      h('div',{class:'prose'},p.body.split(/\n{2,}/).filter(t=>t.trim()).map(t=>h('p',{},t.trim()))),
      h('div',{class:'actions'},
        h('button',{class:'btn ghost',type:'button',onclick:()=>copyText(p.title+'\n\n'+p.body,t('toast_copied','Post copied'))},t('copy_post','Copy text')),
        h('button',{class:'btn ghost',type:'button',onclick:()=>savePostCard(p)},t('share_card','Share card')),
        canShareFiles?h('button',{class:'btn ghost',type:'button',onclick:()=>sharePostCard(p)},t('share_btn','Share')):null,
        h('button',{class:'btn ghost',type:'button',onclick:()=>downloadPostPDF(p)},t('download_pdf','Download PDF')),
        h('button',{class:'btn ghost',type:'button',onclick:()=>printPost(p)},t('print_btn','Print')),
        p.sample?null:h('button',{class:'btn ghost',type:'button',onclick:()=>{openId=null;renderBlog();openComposer(true,p);pf.scrollIntoView({block:'start'})}},t('edit_post','Edit post')),
        p.sample?null:h('button',{class:'btn ghost',type:'button',onclick:ev=>{
          if(!confirmDel){confirmDel=true;ev.target.textContent=t('confirm_delete','Tap again to delete');return}
          mine=mine.filter(x=>x.id!==p.id);savePosts();
          openId=null;confirmDel=false;renderBlog();toast(t('toast_deleted','Post deleted'));
        }},t('delete_post','Delete post'))));
    window.scrollTo(0,0);
    return;
  }
  reader.hidden=true;list.hidden=false;
  updateFilters();
  const q=query.trim().toLowerCase();
  const posts=allPosts().filter(x=>(filter==='all'||x.tag===filter)&&(!q||(x.title+' '+x.body).toLowerCase().includes(q)));
  $('#post-count').textContent=posts.length+(posts.length===1?' '+t('post_singular','post'):' '+t('posts_plural','posts'));
  $('#posts').replaceChildren(...(posts.length?posts.map(x=>h('button',{class:'post card',type:'button',onclick:()=>{openId=x.id;confirmDel=false;renderBlog()}},
    h('span',{class:'tag'},t('filter_'+x.tag,TAGS[x.tag])),
    h('h3',{},x.title),
    h('p',{class:'ex'},excerpt(x.body)),
    h('span',{class:'meta'},fmt(x.date)+' · '+readMins(x.body)+' '+t('min_read','min')+(x.sample?' · Sample':''))
  )):[h('p',{class:'none'},t('no_posts','No posts match. Try another word or topic.'))]));
}
$('#q').addEventListener('input',e=>{query=e.target.value;renderBlog()});

const pf=$('#post-form'),pTitle=$('#p-title'),pBody=$('#p-body'),pTag=$('#p-tag');
function countWords(){
  const n=words(pBody.value);
  $('#p-count').textContent=n+(n===1?' '+t('word','word'):' '+t('words','words'))+(n?' · '+t('about','about')+' '+readMins(pBody.value)+' '+t('min_read','min read'):'');
}
function openComposer(open,post){
  pf.hidden=!open;
  $('#post-toggle').setAttribute('aria-expanded',String(open));
  if(!open)return;
  editingId=post?post.id:null;
  $('#composer-title').textContent=post?t('edit_post_title','Edit post'):t('write_today',"Write today's post");
  $('#p-submit').textContent=post?t('save_changes_btn','Save changes'):t('publish_btn','Save post');
  $('#post-cancel').textContent=t('close_btn','Close');
  const d=post?{t:post.title,b:post.body,g:post.tag}:parse(store.get(K.draft),{});
  pTitle.value=str(d.t,80);pBody.value=str(d.b,20000);pTag.value=TAGS[d.g]?d.g:'journal';
  countWords();
}
function saveDraft(){
  countWords();
  if(editingId)return;
  if(!pTitle.value&&!pBody.value)store.del(K.draft);
  else store.set(K.draft,JSON.stringify({t:pTitle.value,b:pBody.value,g:pTag.value}));
}
[pTitle,pBody,pTag].forEach(el=>el.addEventListener('input',saveDraft));
$('#post-toggle').addEventListener('click',()=>{
  openComposer(pf.hidden);
  if(!pf.hidden)pTitle.focus();
});
$('#post-cancel').addEventListener('click',()=>openComposer(false));
pf.addEventListener('submit',e=>{
  e.preventDefault();
  const title=pTitle.value.trim(),body=pBody.value.trim();
  if(!title||!body){toast(t('toast_fill_first','Add a title and some words first'));return}
  if(editingId){
    const p=mine.find(x=>x.id===editingId);
    if(p){p.title=title;p.body=body;p.tag=pTag.value;p.edited=true}
  }else mine.unshift({id:'p'+Date.now(),tag:pTag.value,date:todayISO(),title,body});
  const was=editingId;editingId=null;
  savePosts();store.del(K.draft);markToday();
  pf.reset();openComposer(false);
  renderBlog();toast(was?t('toast_saved','Changes saved'):t('toast_published','Post saved'));
  if(!was)confettiPop(pf);
});
$('#prompt-blog').addEventListener('click',()=>{
  openId=null;confirmDel=false;renderBlog();
  openComposer(true);
  if(!pTitle.value&&!pBody.value){pTitle.value=PROMPTS[pi];saveDraft()}
  location.hash='#blog';
});

/* ---------- blog share card (Phase 2) ---------- */
/* 3000 x 3000 share card for a blog post on a desk */
async function postCardCanvas(p){
  await ensureFonts(p.title+' '+p.body);
  const S=3000,c=document.createElement('canvas');c.width=c.height=S;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#F6EBDA';ctx.fillRect(0,0,S,S);
  ctx.fillStyle='rgba(42,11,11,.07)';
  for(let y=60;y<S;y+=100)for(let x=60;x<S;x+=100){ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill()}
  const m=330,N=S-2*m,padX=210,maxW=N-2*padX;
  ctx.save();ctx.translate(S/2,S/2);ctx.rotate(-1.4*Math.PI/180);ctx.translate(-S/2,-S/2);
  noteShape(ctx,m+46,m+62,N,N);ctx.fillStyle='rgba(42,11,11,.30)';ctx.fill();
  noteShape(ctx,m,m,N,N);ctx.fillStyle='#FFFDF9';ctx.fill();

  // Topic badge
  const tagText=(TAGS[p.tag]||p.tag||'BLOG').toUpperCase();
  ctx.font='800 52px Mukta, "Noto Sans Devanagari", sans-serif';
  const tw=ctx.measureText(tagText).width;
  const tagH=74,tagW=tw+70,tr=tagH/2;
  let cy=m+320;
  ctx.fillStyle='#2A0B0B';
  ctx.beginPath();
  ctx.arc(m+padX+tr,cy+tr,tr,Math.PI/2,Math.PI*1.5);
  ctx.arc(m+padX+tagW-tr,cy+tr,tr,-Math.PI/2,Math.PI/2);
  ctx.closePath();ctx.fill();
  ctx.fillStyle='#F6EBDA';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(tagText,m+padX+tagW/2,cy+tr+2);

  // Title: Anton UPPERCASE auto-fit max 3 lines
  cy+=tagH+45;
  let titleSize=150,titleLines=[],titleLh=0;
  for(;titleSize>=70;titleSize-=5){
    ctx.font=`400 ${titleSize}px Anton, Impact, "Mukta", sans-serif`;
    titleLines=wrapLines(ctx,p.title.toUpperCase(),maxW);
    titleLh=titleSize*1.08;
    if(titleLines.length<=3)break;
  }
  ctx.fillStyle='#2A0B0B';ctx.textAlign='left';ctx.textBaseline='alphabetic';
  for(const line of titleLines){
    const mt=ctx.measureText(line);
    const A=mt.fontBoundingBoxAscent??titleSize*0.9;
    ctx.fillText(line,m+padX,cy+A);
    cy+=titleLh;
  }

  // Body excerpt (Kalam)
  cy+=80;
  const bottomLimit=m+N-240;
  ctx.font='400 78px Kalam, "Noto Sans Devanagari", cursive';
  const bodyLh=114;
  const rawLines=wrapLines(ctx,p.body.trim(),maxW);
  const maxBodyLines=Math.max(1,Math.floor((bottomLimit-cy)/bodyLh));
  const drawLines=rawLines.slice(0,maxBodyLines);
  if(rawLines.length>maxBodyLines&&drawLines.length){
    drawLines[drawLines.length-1]=drawLines[drawLines.length-1].replace(/\s*\S*$/,'')+'…';
  }
  ctx.fillStyle='#2A0B0B';ctx.textAlign='left';ctx.textBaseline='alphabetic';
  for(const line of drawLines){
    if(line){
      const mt=ctx.measureText(line);
      const A=mt.fontBoundingBoxAscent??78*0.9;
      ctx.fillText(line,m+padX,cy+A);
    }
    cy+=bodyLh;
  }

  // Date
  ctx.font='600 64px Mukta, "Noto Sans Devanagari", sans-serif';
  ctx.fillStyle='#6B5A4A';
  ctx.fillText(fmt(p.date),m+padX,m+N-130);

  // Tape strip on top
  ctx.save();ctx.translate(S/2,m+6);ctx.rotate(-2.5*Math.PI/180);
  ctx.fillStyle='rgba(255,255,255,.62)';ctx.fillRect(-380,-105,760,210);
  ctx.strokeStyle='rgba(42,11,11,.16)';ctx.lineWidth=5;ctx.strokeRect(-380,-105,760,210);
  ctx.restore();
  ctx.restore();

  // Desk mark
  ctx.fillStyle='rgba(42,11,11,.55)';ctx.font='400 78px Anton, Impact, sans-serif';ctx.textAlign='center';
  ctx.fillText('UNWRITTEN',S/2,S-120);
  return c;
}
const postFile=p=>'unwritten-post-'+(p.date||todayISO())+'-'+p.id.replace(/\W/g,'').slice(-5)+'.png';
async function savePostCard(p){
  try{toast(t('toast_making_card','Making share card…'));saveBlob(postFile(p),await toBlob(await postCardCanvas(p)));toast(t('toast_card_saved','Share card saved'))}
  catch(e){toast('Could not make share card')}
}
async function sharePostCard(p){
  try{await shareBlobs([await toBlob(await postCardCanvas(p))],[postFile(p)],p.title||'Blog post from UNWRITTEN')}
  catch(e){toast('Could not make share card')}
}

/* ---------- blog post printable & PDF (Phase 3) ---------- */
function layoutPost(p){
  const maxW=(210-2*PADX)*MM;
  const titleSize=22*300/72;
  const bodySize=13*300/72;
  const rows=[];

  mctx.font=`400 ${titleSize}px Anton, Impact, "Mukta", sans-serif`;
  wrapLines(mctx,p.title.toUpperCase(),maxW).forEach(t=>rows.push({t,kind:'title'}));

  const tagStr=TAGS[p.tag]||p.tag||'';
  rows.push({t:fmt(p.date)+(tagStr?'  ·  '+tagStr.toUpperCase():''),kind:'meta'});
  rows.push({t:'',kind:'gap'});

  mctx.font=`400 ${bodySize}px Mukta, "Noto Sans Devanagari", sans-serif`;
  const paras=p.body.split(/\n{2,}/).filter(x=>x.trim());
  paras.forEach((para,idx)=>{
    wrapLines(mctx,para.trim(),maxW).forEach(t=>rows.push({t,kind:'body'}));
    if(idx<paras.length-1)rows.push({t:'',kind:'gap'});
  });

  const pages=[];let cur=[];
  for(const r of rows){
    if(cur.length===ROWS){pages.push(cur);cur=[]}
    if(!cur.length&&pages.length&&!r.t)continue;
    cur.push(r);
  }
  if(cur.length)pages.push(cur);
  return pages;
}

function drawPostPage(p,rows,pageIdx,totalPages){
  const c=document.createElement('canvas');c.width=PG.W;c.height=PG.H;
  const ctx=c.getContext('2d'),lh=LH*MM,px=PADX*MM,pt=PADT*MM;
  ctx.fillStyle='#FFFDF8';ctx.fillRect(0,0,PG.W,PG.H);

  const titleSize=22*300/72,metaSize=11*300/72,bodySize=13*300/72;
  ctx.textBaseline='alphabetic';
  rows.forEach((r,i)=>{
    if(!r.t)return;
    if(r.kind==='title'){
      ctx.font=`400 ${titleSize}px Anton, Impact, "Mukta", sans-serif`;
      ctx.fillStyle='#2A0B0B';ctx.textAlign='left';
      const mt=ctx.measureText(r.t),A=mt.fontBoundingBoxAscent??titleSize*0.9,D=mt.fontBoundingBoxDescent??titleSize*0.3;
      ctx.fillText(r.t,px,pt+i*lh+(lh-(A+D))/2+A);
    }else if(r.kind==='meta'){
      ctx.font=`600 ${metaSize}px Mukta, "Noto Sans Devanagari", sans-serif`;
      ctx.fillStyle='#6B5A4A';ctx.textAlign='left';
      const mt=ctx.measureText(r.t),A=mt.fontBoundingBoxAscent??metaSize*0.9,D=mt.fontBoundingBoxDescent??metaSize*0.3;
      ctx.fillText(r.t,px,pt+i*lh+(lh-(A+D))/2+A);
    }else{
      ctx.font=`400 ${bodySize}px Mukta, "Noto Sans Devanagari", sans-serif`;
      ctx.fillStyle='#2A0B0B';ctx.textAlign='left';
      const mt=ctx.measureText(r.t),A=mt.fontBoundingBoxAscent??bodySize*0.9,D=mt.fontBoundingBoxDescent??bodySize*0.3;
      ctx.fillText(r.t,px,pt+i*lh+(lh-(A+D))/2+A);
    }
  });

  if(totalPages>1){
    ctx.font=`600 ${metaSize}px Mukta, "Noto Sans Devanagari", sans-serif`;
    ctx.fillStyle='#6B5A4A';ctx.textAlign='right';
    ctx.fillText(`Page ${pageIdx+1} of ${totalPages}`,PG.W-px,PG.H-pt/1.5);
  }
  return c;
}

async function downloadPostPDF(p){
  try{
    toast(t('toast_making_pdf','Making your PDF…'));
    await ensureFonts(p.title+' '+p.body);
    const pgs=layoutPost(p);
    const pages=[];
    for(let i=0;i<pgs.length;i++){
      const c=drawPostPage(p,pgs[i],i,pgs.length);
      const b=await toBlob(c,'image/jpeg',.95);
      pages.push({w:c.width,h:c.height,bytes:new Uint8Array(await b.arrayBuffer())});
    }
    saveBlob('unwritten-post-'+(p.date||todayISO())+'.pdf',await makePDF(pages));
    markToday();toast(t('toast_pdf_saved','PDF saved'));
  }catch(e){toast('Could not make the PDF')}
}

function postPaperEl(rows,pgIdx,totalPgs){
  return h('div',{class:'paper typed',style:'--paper:#FFFDF8;--fs:4.586;--dy:0'},
    h('div',{class:'rows'},rows.map(r=>{
      let cls='row';
      if(r.kind==='title')cls+=' post-title-row';
      else if(r.kind==='meta')cls+=' post-meta-row';
      return h('div',{class:cls},r.t);
    })),
    totalPgs>1?h('div',{class:'post-pgno'},`Page ${pgIdx+1} of ${totalPgs}`):null
  );
}

async function printPost(p){
  try{
    await ensureFonts(p.title+' '+p.body);
    const pgs=layoutPost(p);
    $('#print-root').replaceChildren(...pgs.map((pg,i)=>h('div',{class:'pp',style:'background:#FFFDF8'},postPaperEl(pg,i,pgs.length))));
    markToday();
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    window.print();
  }catch(e){toast('Could not open print')}
}

/* ---------- sticky notes ---------- */
const NC={yellow:['Yellow','#FFE761'],orange:['Orange','#FF9A4D'],coral:['Coral','#FF7B88'],sky:['Sky blue','#7FB2FF'],peri:['Periwinkle','#A3AEF8']};
const SEEDS=[
 {id:'n1',c:'yellow',t:'Drink water. Eat something real. You are doing fine.',f:'A friend'},
 {id:'n2',c:'coral',t:'Lowkey proud of you. Highkey too.',f:'Me, to you'},
 {id:'n3',c:'sky',t:'आज एक चिठ्ठी लिहा. कुणाला तरी आनंद होईल.',f:'कुणीतरी'},
 {id:'n4',c:'orange',t:'Call your aunt. She asked about you.',f:'Aai'}
];
function cleanNote(n){
  if(!n||typeof n!=='object'||typeof n.t!=='string'||!n.t.trim())return null;
  return{id:str(n.id,40)||'n'+Math.random().toString(36).slice(2,9),c:NC[n.c]?n.c:'yellow',t:str(n.t,300),f:str(n.f,24)};
}
let notes=store.get(K.notes)===null?SEEDS.slice():loadList(K.notes,cleanNote);
const saveNotes=()=>store.set(K.notes,JSON.stringify(notes));
const ROT=[-2.5,1.8,-1,2.6,-1.8,1.2];
let nColor='yellow';
$('#n-swatches').replaceChildren(...Object.entries(NC).map(([k,[name,hex]])=>
  h('label',{class:'sw',title:name},
    h('input',{type:'radio',name:'ncolor',value:k,'aria-label':name,checked:k===nColor,onchange:()=>{nColor=k}}),
    h('span',{style:'--c:'+hex}))));

/* a 3000 x 3000 picture of one note, taped to a cream desk */
async function noteCanvas(n){
  await ensureFonts(n.t+(n.f||''));
  const S=3000,c=document.createElement('canvas');c.width=c.height=S;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#F6EBDA';ctx.fillRect(0,0,S,S);
  ctx.fillStyle='rgba(42,11,11,.07)';
  for(let y=60;y<S;y+=100)for(let x=60;x<S;x+=100){ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill()}
  const m=330,N=S-2*m,padX=210,maxW=N-2*padX;
  ctx.save();ctx.translate(S/2,S/2);ctx.rotate(-1.6*Math.PI/180);ctx.translate(-S/2,-S/2);
  noteShape(ctx,m+46,m+62,N,N);ctx.fillStyle='rgba(42,11,11,.30)';ctx.fill();
  noteShape(ctx,m,m,N,N);ctx.fillStyle=(NC[n.c]||NC.yellow)[1];ctx.fill();
  const top=m+330,bottom=m+N-(n.f?330:190);
  let size=250,lines=[],lh=0;
  for(;size>=96;size-=6){
    ctx.font=`700 ${size}px Kalam, "Noto Sans Devanagari", sans-serif`;
    lines=wrapLines(ctx,n.t,maxW);lh=size*1.36;
    if(lines.length*lh<=bottom-top)break;
  }
  let y=top+Math.max(0,(bottom-top-lines.length*lh)/2);
  ctx.fillStyle='#2A0B0B';ctx.textAlign='left';ctx.textBaseline='alphabetic';
  for(const t of lines){
    if(t){const mt=ctx.measureText(t),A=mt.fontBoundingBoxAscent??size*.95,D=mt.fontBoundingBoxDescent??size*.4;ctx.fillText(t,m+padX,y+(lh-(A+D))/2+A)}
    y+=lh;
  }
  if(n.f){ctx.font='800 92px Mukta, "Noto Sans Devanagari", sans-serif';ctx.fillText('— '+n.f,m+padX,m+N-170)}
  ctx.save();ctx.translate(S/2,m+6);ctx.rotate(-3*Math.PI/180);
  ctx.fillStyle='rgba(255,255,255,.62)';ctx.fillRect(-380,-105,760,210);
  ctx.strokeStyle='rgba(42,11,11,.16)';ctx.lineWidth=5;ctx.strokeRect(-380,-105,760,210);
  ctx.restore();ctx.restore();
  ctx.fillStyle='rgba(42,11,11,.55)';ctx.font='400 78px Anton, Impact, sans-serif';ctx.textAlign='center';
  ctx.fillText('UNWRITTEN',S/2,S-120);
  return c;
}
const noteFile=n=>'unwritten-note-'+todayISO()+'-'+n.id.replace(/\W/g,'').slice(-5)+'.png';
async function saveNote(n){
  try{toast(t('toast_making_img','Making your image…'));saveBlob(noteFile(n),await toBlob(await noteCanvas(n)));toast(t('toast_note_saved','Note image saved'));}
  catch(e){toast('Could not make the image')}
}
async function shareNote(n){
  try{await shareBlobs([await toBlob(await noteCanvas(n))],[noteFile(n)],'A note from UNWRITTEN')}
  catch(e){toast('Could not make the image')}
}
function renderWall(){
  const w=$('#wall');
  if(!notes.length){w.replaceChildren(h('p',{class:'empty-wall'},t('empty_wall','The wall is empty. Stick the first note above.')));return}
  w.replaceChildren(...notes.map((n,i)=>h('div',{class:'note',style:'--c:'+(NC[n.c]||NC.yellow)[1]+';--r:'+ROT[i%ROT.length]+'deg'},
    h('button',{class:'x',type:'button','aria-label':t('delete_note','Delete note'),onclick:()=>{notes=notes.filter(x=>x.id!==n.id);saveNotes();renderWall()}},'×'),
    h('p',{},n.t),
    h('div',{class:'nfoot'},
      n.f?h('span',{class:'from'},'— '+n.f):h('span'),
      h('div',{class:'nbtns'},
        h('button',{class:'nbtn',type:'button',onclick:()=>saveNote(n)},t('save_image','Save image')),
        canShareFiles?h('button',{class:'nbtn',type:'button',onclick:()=>shareNote(n)},t('share_btn','Share')):null)))));
}
const nt=$('#n-text');
nt.addEventListener('input',()=>{
  $('#n-count').textContent=nt.value.length+' / 140';
  $('#n-go').disabled=!nt.value.trim();
});
$('#note-form').addEventListener('submit',e=>{
  e.preventDefault();
  const txt=nt.value.trim();if(!txt)return;
  notes.unshift({id:'n'+Date.now(),c:nColor,t:txt,f:$('#n-from').value.trim()});
  saveNotes();markToday();
  nt.value='';$('#n-count').textContent='0 / 140';$('#n-go').disabled=true;
  renderWall();toast(t('toast_note_stuck','Note stuck on the wall'));
  confettiPop($('#note-form'));
});

/* ---------- letter ----------
   One layout (layoutLetter) decides which text goes on which line of which page.
   The preview, the print page and the PNG all draw that same layout, so they match. */
const PAPERS={white:['White','#FFFFFF'],cream:['Cream','#FBF1DE'],butter:['Butter','#FFF3A6'],sky:['Sky','#D8E6FF'],blush:['Blush','#FFDCD2']};
const STYLES={hand:{fam:'Kalam',pt:15,w:400,cls:'hand'},typed:{fam:'Mukta',pt:13,w:400,cls:'typed'}};
/* decorations: each shape is drawn in a 100x100 box. Items are [shape, x, y, size, rotation, colour#, opacity] in mm.
   The same list feeds the SVG preview and the canvas, so they always match. */
const circ=(x,y,r)=>`M${x-r} ${y}a${r} ${r} 0 1 0 ${2*r} 0a${r} ${r} 0 1 0 ${-2*r} 0Z`;
const SH={
  heart:{d:'M50 90C20 68 6 48 6 31C6 17 17 9 29 9C38 9 46 14 50 22C54 14 62 9 71 9C83 9 94 17 94 31C94 48 80 68 50 90Z'},
  star:{d:'M50 6L61.8 36.4L94.5 38.2L69 58.7L77.5 90.3L50 72.5L22.5 90.3L31 58.7L5.5 38.2L38.2 36.4Z'},
  spark:{d:'M50 4C54 32 68 46 96 50C68 54 54 68 50 96C46 68 32 54 4 50C32 46 46 32 50 4Z'},
  leaf:{d:'M50 94C18 72 12 38 50 6C88 38 82 72 50 94Z'},
  dot:{d:circ(50,50,40)},
  moon:{d:'M58 6A44 44 0 1 0 94 64A36 36 0 0 1 58 6Z'},
  balloon:{d:'M50 4C78 4 90 28 90 48C90 70 68 84 50 88C32 84 10 70 10 48C10 28 22 4 50 4ZM43 88L57 88L50 97Z'},
  flower:{d:[0,72,144,216,288].map(a=>{const r=a*Math.PI/180-Math.PI/2;return circ(50+25*Math.cos(r),50+25*Math.sin(r),17)}).join(''),c2:circ(50,50,12)},
  /* Phase 1 additions */
  /* raindrop: pointed tip at bottom, round arc at top */
  drop:{d:'M50 90Q24 68 20 52A32 32 0 0 0 80 52Q76 68 50 90Z'},
  /* cloud: bumpy top, flat base; traced clockwise from bottom-left */
  cloud:{d:'M12 72Q12 55 25 52Q24 34 42 32Q44 16 60 18Q74 12 82 28Q94 26 94 42Q96 56 82 60Q88 74 72 74L12 72Z'},
  /* diya oil lamp: oval body (d, tinted by cols), pointed flame (c2, always #FFD43B) */
  diya:{d:'M8 72Q8 88 50 90Q92 88 92 72Q92 56 50 54Q8 56 8 72Z',c2:'M50 54C44 43 44 25 50 18C56 25 56 43 50 54Z'},
  /* confetti: small rounded rectangle, looks scattered when rotated */
  confetti:{d:'M28 34Q22 34 22 42L22 58Q22 66 28 66L72 66Q78 66 78 58L78 42Q78 34 72 34Z'}
};
const rr=(x,y,w,h,r)=>`M${x+r} ${y}H${x+w-r}A${r} ${r} 0 0 1 ${x+w} ${y+r}V${y+h-r}A${r} ${r} 0 0 1 ${x+w-r} ${y+h}H${x+r}A${r} ${r} 0 0 1 ${x} ${y+h-r}V${y+r}A${r} ${r} 0 0 1 ${x+r} ${y}Z`;
const THEMES={
  none:{name:'Plain',icon:'📄'},
  love:{name:'Love',icon:'❤️',paper:'blush',cols:['#FF5C77','#FF8FA3','#E8325A','#FFB8C6'],items:[
    ['heart',192,13,15,-14,0],['heart',174,9,8,12,1],['heart',201,31,9,18,2],
    ['heart',17,283,17,12,0],['heart',34,289,9,-16,1],['heart',7,265,9,-10,3],
    ['heart',195,284,11,14,2],['heart',181,290,6,-8,1]]},
  birthday:{name:'Birthday',icon:'🎈',paper:'butter',cols:['#FFB400','#FF6B6B','#4DABF7','#9775FA','#40C057'],items:[
    ['balloon',191,14,15,10,1],['balloon',174,11,11,-8,2],['star',201,34,7,15,0],['spark',150,9,6,0,4],['dot',162,6,3.5,0,3],
    ['star',14,284,10,-12,0],['spark',30,289,7,0,3],['dot',8,268,4,0,1],['dot',24,279,3,0,2],
    ['spark',196,285,9,0,2],['dot',184,291,4,0,1],['star',203,270,6,20,4],
    ['dot',8,10,4,0,1],['star',16,6,6,10,3]]},
  thanks:{name:'Thank you',icon:'🌸',paper:'cream',cols:['#FF8FA3','#FFA94D','#8CCB5E','#4FB58C'],items:[
    ['flower',190,14,16,0,0],['flower',175,9,9,20,1],['leaf',202,30,10,35,2],['leaf',165,14,8,-40,3],
    ['flower',16,283,16,0,1],['leaf',32,288,10,-50,2],['leaf',8,268,9,60,3],
    ['flower',197,284,11,10,0],['leaf',184,290,8,40,3]]},
  dreamy:{name:'Dreamy',icon:'🌙',paper:'sky',cols:['#F4B400','#8E7CFF','#4C9BFF','#FF7FA8'],items:[
    ['moon',190,15,16,15,0],['star',172,10,7,0,0],['spark',201,34,8,0,1],['spark',158,15,5,0,2],
    ['star',14,284,9,0,0],['spark',30,289,8,0,2],['dot',8,268,3,0,3],
    ['star',198,285,7,20,1],['spark',184,290,6,0,3],['dot',204,272,3,0,2],
    ['spark',10,12,7,0,2],['dot',22,7,3,0,0]]},
  festive:{name:'Festive',icon:'🪔',paper:'butter',cols:['#FF8A00','#E63946','#FFC53D','#FF6A18'],items:[
    ['spark',190,14,15,0,0],['star',174,9,7,10,2],['dot',201,31,5,0,1],
    ['spark',16,283,15,0,0],['star',32,289,8,-10,2],['dot',7,268,5,0,1],
    ['spark',196,284,10,0,3],['dot',183,291,4,0,2],['star',10,11,6,0,2],['dot',21,6,3,0,1]]},
  frame:{name:'Frame',icon:'🖼️',paper:'cream',cols:['#E8A317'],frame:[[6,5,.7,.75],[9.5,3,.3,.5]],items:[
    ['spark',6,6,7,0,0],['spark',204,6,7,0,0],['spark',6,291,7,0,0],['spark',204,291,7,0,0]]},
  /* --- Phase 1: six new themes --- */
  /* decorations are in corners/margins only so they stay behind the text */
  rainy:{name:'Rainy Day',icon:'🌧️',paper:'sky',cols:['#5B8DB8','#8EB8D8','#3A6A90','#A8C8E0'],items:[
    /* top-right: cloud + drops falling */
    ['cloud',168,6,22,0,1],
    ['drop',196,14,9,-5,0],['drop',191,26,7,4,2],['drop',193,34,6,-3,1],
    ['dot',160,10,3,0,3],
    /* bottom-left: cloud + drops */
    ['cloud',2,284,17,0,3],
    ['drop',9,280,9,3,0],['drop',23,287,7,-6,2],['drop',14,294,6,5,1],
    ['dot',34,278,3,0,1],['dot',27,285,3,0,0]]},
  diwali:{name:'Diwali',icon:'🎆',paper:'butter',cols:['#FFC107','#FF6A18','#E63946','#FFD43B'],items:[
    /* top-right: diya with sparks (flame rendered via diya.c2 in yellow) */
    ['diya',187,8,16,0,0],['spark',173,6,8,0,3],['dot',202,22,5,0,1],
    ['spark',162,10,6,0,2],['dot',171,19,3,0,0],
    /* bottom-left: diya */
    ['diya',10,285,16,0,0],['spark',25,278,8,0,3],
    ['spark',6,268,9,0,2],['dot',30,280,4,0,1],
    /* bottom-right: smaller diya */
    ['diya',193,279,12,0,1],['spark',202,270,7,0,3],
    ['dot',8,8,4,0,3],['spark',19,5,6,0,0]]},
  friendship:{name:'Friendship',icon:'🌟',paper:'butter',cols:['#FFD43B','#FF9A4D','#FF8FA3','#9775FA'],items:[
    ['star',190,10,14,8,0],['heart',174,8,7,12,2],['spark',204,28,7,0,1],
    ['dot',162,12,3,0,3],['heart',200,5,5,-8,2],
    ['star',12,282,12,-10,0],['heart',30,288,8,15,2],['spark',6,280,8,0,1],
    ['dot',26,278,3,0,3],
    ['star',196,282,10,15,1],['heart',183,290,6,-12,2],
    ['dot',8,10,3,0,0],['spark',17,5,6,0,3]]},
  sorry:{name:'Sorry',icon:'🌿',paper:'blush',cols:['#D4A5B5','#8FAF8A','#C98DA8','#B5C9B5'],items:[
    ['flower',191,12,15,0,0],['leaf',176,8,9,30,1],['flower',202,30,9,20,2],
    ['leaf',165,14,7,-40,3],
    ['flower',14,283,15,0,2],['leaf',30,288,9,-50,1],['leaf',8,278,8,60,3],
    ['flower',195,282,10,10,0],['leaf',183,290,7,35,1],
    ['dot',166,15,3,0,3],['dot',10,278,3,0,0]]},
  congrats:{name:'Congrats',icon:'🎉',paper:'cream',cols:['#FF6B6B','#FFD43B','#4DABF7','#40C057','#9775FA'],items:[
    ['confetti',191,10,11,25,0],['confetti',176,7,9,-40,2],['confetti',202,22,8,15,3],
    ['star',165,14,7,0,1],['confetti',158,8,7,55,4],
    ['spark',194,32,6,0,2],['dot',172,5,3,0,3],
    ['confetti',12,278,10,-30,1],['confetti',28,286,8,45,0],['star',8,280,8,15,3],
    ['confetti',198,282,9,20,4],['confetti',184,290,7,-15,2],
    ['spark',10,8,7,0,0],['dot',20,5,3,0,1],
    ['star',200,280,6,0,1]]},
  missing:{name:'Missing You',icon:'💭',paper:'sky',cols:['#2D3E6D','#7B91C0','#F4B400','#ACC4E8'],items:[
    ['moon',188,8,18,10,0],['star',172,10,8,0,2],['spark',203,28,7,0,1],
    ['dot',162,15,3,0,3],['star',196,6,5,20,0],
    ['star',10,280,9,-12,2],['moon',6,284,14,-8,0],['spark',28,288,7,0,1],
    ['dot',26,277,3,0,3],
    ['star',196,283,8,15,2],['spark',183,291,6,0,3],
    ['dot',8,8,3,0,3],['star',18,5,6,10,0]]}
};
const deco=t=>{const x=THEMES[t];return x&&(x.items||x.frame)?x:null};
function decoSVG(t){
  const th=deco(t);if(!th)return'';
  let s='<svg viewBox="0 0 210 297" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
  for(const[i,r,w,a]of th.frame||[])s+=`<path d="${rr(i,i,210-2*i,297-2*i,r)}" fill="none" stroke="#1B2559" stroke-width="${w}" opacity="${a}"/>`;
  for(const[k,x,y,sz,rot,ci,al=.92]of th.items||[]){
    s+=`<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sz/100}) translate(-50 -50)" opacity="${al}"><path d="${SH[k].d}" fill="${th.cols[ci]}"/>`+(SH[k].c2?`<path d="${SH[k].c2}" fill="#FFD43B"/>`:'')+'</g>';
  }
  return s+'</svg>';
}
function drawDeco(ctx,t){
  const th=deco(t);if(!th)return;
  for(const[i,r,w,a]of th.frame||[]){
    ctx.save();ctx.scale(MM,MM);ctx.globalAlpha=a;ctx.strokeStyle='#1B2559';ctx.lineWidth=w;
    ctx.stroke(new Path2D(rr(i,i,210-2*i,297-2*i,r)));ctx.restore();
  }
  for(const[k,x,y,sz,rot,ci,al=.92]of th.items||[]){
    ctx.save();ctx.translate(x*MM,y*MM);ctx.rotate(rot*Math.PI/180);const f=sz*MM/100;ctx.scale(f,f);ctx.translate(-50,-50);
    ctx.globalAlpha=al;ctx.fillStyle=th.cols[ci];ctx.fill(new Path2D(SH[k].d));
    if(SH[k].c2){ctx.fillStyle='#FFD43B';ctx.fill(new Path2D(SH[k].c2))}
    ctx.restore();
  }
}
const L0={greet:'Dear ',body:'',sign:'With love,',from:'',date:todayISO(),paper:'cream',lined:true,style:'hand',theme:'none'};
function cleanLetter(o){
  const r={};
  if(!o||typeof o!=='object')return r;
  for(const[k,max]of[['greet',60],['body',8000],['sign',40],['from',40]])if(typeof o[k]==='string')r[k]=o[k].slice(0,max);
  if(isDay(o.date))r.date=o.date;
  if(PAPERS[o.paper])r.paper=o.paper;
  if(STYLES[o.style])r.style=o.style;
  if(THEMES[o.theme])r.theme=o.theme;
  if(typeof o.lined==='boolean')r.lined=o.lined;
  return r;
}
const L=Object.assign({},L0,cleanLetter(parse(store.get(K.letter),{})));
if(!L.body.trim())L.date=todayISO();      /* an unwritten letter always shows today's date */
const letterText=()=>[L.greet,'',L.body,'',L.sign,L.from].join('\n').trim();

function layoutLetter(preview){
  const st=STYLES[L.style]||STYLES.hand;
  const size=st.pt*300/72,maxW=(210-2*PADX)*MM,fam=`${st.fam}, "Noto Sans Devanagari", sans-serif`;
  const sample=preview&&!L.body.trim()&&!L.from.trim()&&L.greet.trim()===L0.greet.trim()&&L.sign.trim()===L0.sign.trim();
  const greet=sample?t('starter_aai_greet','Dear Aai,'):L.greet;
  const body=sample?t('starter_aai_body'):L.body;
  const sign=sample?t('starter_aai_sign','With all my love,'):L.sign;
  const rows=[];
  const add=(text,kind,bold)=>{mctx.font=`${bold?700:st.w} ${size}px ${fam}`;wrapLines(mctx,text,maxW).forEach(t=>rows.push({t,kind,bold}))};
  rows.push({t:L.date?fmt(L.date):'',kind:'date'});
  rows.push({t:'',kind:'gap'});
  if(greet.trim())add(greet.trim(),'greet');
  if(body.trim())add(body.replace(/\s+$/,''),'body');
  else if(preview)rows.push({t:'Your letter appears here as you type…',kind:'ph'});
  if(sign.trim()||L.from.trim())rows.push({t:'',kind:'gap'});
  if(sign.trim())add(sign.trim(),'sign');
  if(L.from.trim())add(L.from.trim(),'from',true);
  const pages=[];let cur=[];
  for(const r of rows){
    if(cur.length===ROWS){pages.push(cur);cur=[]}
    if(!cur.length&&pages.length&&!r.t)continue;           /* no blank line at the top of a new page */
    cur.push(r);
  }
  if(cur.length)pages.push(cur);
  return pages;
}
function decoEl(){
  const th=deco(L.theme);if(!th)return null;
  const d=h('div',{class:'deco'+(th.frame?' still':'')});d.innerHTML=decoSVG(L.theme);return d;
}
function paperEl(rows,st){
  return h('div',{class:'paper '+st.cls+(L.lined?' lined':''),
    style:`--paper:${(PAPERS[L.paper]||PAPERS.cream)[1]};--fs:${(st.pt*25.4/72).toFixed(4)};--dy:${DY}`},
    decoEl(),
    h('div',{class:'rows'},rows.map(r=>h('div',{class:'row'+(r.kind==='date'?' date':'')+(r.bold?' b':'')+(r.kind==='ph'?' ph':'')},r.t))));
}
function renderLetter(){
  store.set(K.letter,JSON.stringify(L));
  const st=STYLES[L.style]||STYLES.hand,pages=layoutLetter(true);
  $$('input[name=lpaper]').forEach(r=>{r.checked=r.value===L.paper});
  $('#sheets').replaceChildren(...pages.map((pg,i)=>h('div',{},
    h('div',{class:'sheetbox'},paperEl(pg,st)),
    pages.length>1?h('p',{class:'pgno'},`Page ${i+1} of ${pages.length}`):null)));
  const sample=!L.body.trim()&&!L.from.trim()&&L.greet.trim()===L0.greet.trim()&&L.sign.trim()===L0.sign.trim();
  $('#sheet-caption').textContent=sample?t('starter_preview_caption'):'A4 · '+pages.length+(pages.length===1?' page':' pages')+' · exports at 300 dpi';
}
let letterQueued=false;
const queueLetter=()=>{if(letterQueued)return;letterQueued=true;requestAnimationFrame(()=>{letterQueued=false;renderLetter()})};

/* one suggested start at a time, matched to the occasion */
const STARTS={
  none:['Today I felt…','Remember when…','तुला सांगायचं होतं की…'],
  love:['I never told you, but…','Every time I see you…','तुला सांगायचं होतं की…'],
  birthday:['Happy birthday! I hope…','The best thing about you is…'],
  thanks:['Thank you for…','I never said thank you for…'],
  sorry:["I'm sorry that…",'I should have said…'],
  missing:['I miss you because…','Remember when…'],
  congrats:['Congratulations on…','I always knew you would…'],
  friendship:['Remember when…','You are the kind of friend who…']
};
let startI=0;
const startList=()=>STARTS[L.theme]||STARTS.none;
const startNow=()=>{const l=startList();return l[startI%l.length]};
function renderStarter(){$('#starter-btn').textContent=startNow()}
$('#starter-btn').addEventListener('click',()=>{
  const ta=$('#l-body'),s=startNow();
  if(ta.value&&!/\s$/.test(ta.value.slice(0,ta.selectionStart)))ta.setRangeText(' ',ta.selectionStart,ta.selectionEnd,'end');
  ta.setRangeText(s+' ',ta.selectionStart,ta.selectionEnd,'end');
  ta.dispatchEvent(new Event('input'));ta.focus();
});
$('#starter-next').addEventListener('click',()=>{startI++;renderStarter()});
$('#l-paper').replaceChildren(...Object.entries(PAPERS).map(([k,[name,hex]])=>
  h('label',{class:'sw',title:name},
    h('input',{type:'radio',name:'lpaper',value:k,'aria-label':name,onchange:()=>{L.paper=k;renderLetter()}}),
    h('span',{style:'--c:'+hex}))));
/* occasion chips: a few main ones, the rest under "More". Choosing one also sets a matching paper colour */
const MAIN_THEMES=['none','love','birthday','thanks','sorry','missing'];
let moreThemes=false;
function renderThemes(){
  const show=moreThemes?Object.keys(THEMES):MAIN_THEMES.filter(k=>THEMES[k]);
  $('#l-theme').replaceChildren(
    ...show.map(k=>{const th=THEMES[k];return h('button',{class:'chip',type:'button','aria-pressed':String(L.theme===k),onclick:()=>{
      L.theme=k;if(th.paper)L.paper=th.paper;startI=0;renderThemes();renderStarter();renderLetter();
    }},th.icon+' '+th.name)}),
    h('button',{class:'chip quiet',type:'button','aria-expanded':String(moreThemes),onclick:()=>{moreThemes=!moreThemes;renderThemes()}},
      moreThemes?'− '+t('less','Less'):'+ '+t('more_themes','More')));
}
const LIDS={greet:'#l-greet',body:'#l-body',sign:'#l-sign',from:'#l-from',date:'#l-date',style:'#l-style'};
function syncLetterInputs(){
  for(const[k,sel]of Object.entries(LIDS))$(sel).value=L[k];
  $('#l-lines').checked=!!L.lined;
  if(!MAIN_THEMES.includes(L.theme))moreThemes=true;   /* keep a chosen extra occasion visible */
  renderThemes();renderStarter();letterCount();
}
function letterCount(){
  const n=(L.body.trim().match(/\S+/g)||[]).length;
  $('#l-count').textContent=n?n+' '+t(n===1?'word':'words')+' · '+t('saved_ok','saved'):'';
}
for(const[k,sel]of Object.entries(LIDS))$(sel).addEventListener('input',e=>{
  L[k]=e.target.value;
  if(k==='body'&&L.body.trim())markToday(true);
  renderLetter();if(k==='body')letterCount();
});
$('#l-lines').addEventListener('change',e=>{L.lined=e.target.checked;renderLetter()});

/* the PNG: same layout, drawn at 300 dpi */
function drawLetterPage(rows){
  const st=STYLES[L.style]||STYLES.hand,size=st.pt*300/72,fam=`${st.fam}, "Noto Sans Devanagari", sans-serif`;
  const c=document.createElement('canvas');c.width=PG.W;c.height=PG.H;
  const ctx=c.getContext('2d'),lh=LH*MM,px=PADX*MM,pt=PADT*MM;
  ctx.fillStyle=(PAPERS[L.paper]||PAPERS.cream)[1];ctx.fillRect(0,0,PG.W,PG.H);
  drawDeco(ctx,L.theme);
  if(L.lined){
    ctx.strokeStyle='rgba(27,37,89,.18)';ctx.lineWidth=2;
    for(let i=1;i<=ROWS;i++){const y=Math.round(pt+i*lh);ctx.beginPath();ctx.moveTo(px,y);ctx.lineTo(PG.W-px,y);ctx.stroke()}
  }
  ctx.fillStyle='#1B2559';ctx.textBaseline='alphabetic';
  rows.forEach((r,i)=>{
    if(!r.t)return;
    ctx.font=`${r.bold?700:st.w} ${size}px ${fam}`;
    const mt=ctx.measureText(r.t),A=mt.fontBoundingBoxAscent??size*.95,D=mt.fontBoundingBoxDescent??size*.4;
    ctx.textAlign=r.kind==='date'?'right':'left';
    ctx.fillText(r.t,r.kind==='date'?PG.W-px:px,pt+i*lh+(lh-(A+D))/2+A+DY*MM);
  });
  return c;
}
async function letterBlobs(){
  await ensureFonts(letterText());
  const out=[];
  for(const pg of layoutLetter(false))out.push(await toBlob(drawLetterPage(pg)));
  return out;
}
const letterNames=n=>{const base='unwritten-letter-'+(L.date||todayISO());return Array.from({length:n},(_,i)=>n>1?`${base}-page-${i+1}.png`:`${base}.png`)};
const needText=()=>{if(L.body.trim())return true;toast('Write something first');return false};

$('#l-image').addEventListener('click',async()=>{
  if(!needText())return;
  try{
    toast(t('toast_making_img','Making your image…'));
    const blobs=await letterBlobs(),names=letterNames(blobs.length);
    for(let i=0;i<blobs.length;i++){saveBlob(names[i],blobs[i]);if(i<blobs.length-1)await wait(500)}
    markToday();
    toast(blobs.length>1?'Saved '+blobs.length+' page images. Allow multiple downloads if asked.':t('toast_img_saved','Letter image saved'));
  }catch(e){toast('Could not make the image. Try a shorter letter.')}
});
if(canShareFiles){
  $('#l-share').hidden=false;
  $('#l-share').addEventListener('click',async()=>{
    if(!needText())return;
    try{const blobs=await letterBlobs();await shareBlobs(blobs,letterNames(blobs.length),'A letter from UNWRITTEN');markToday()}
    catch(e){toast('Could not make the image')}
  });
}
/* PDF: a tiny writer that puts each 300 dpi page image on a full-bleed A4 page.
   No margins, no scaling, and it looks the same on every phone and laptop. */
async function makePDF(pages){
  const enc=new TextEncoder(),parts=[],offs=[];let len=0;
  const push=x=>{const b=typeof x==='string'?enc.encode(x):x;parts.push(b);len+=b.length};
  const obj=(n,body)=>{offs[n]=len;push(`${n} 0 obj\n${body}\nendobj\n`)};
  const W=595.28,H=841.89,n=pages.length;
  push('%PDF-1.4\n');
  obj(1,'<</Type/Catalog/Pages 2 0 R>>');
  obj(2,`<</Type/Pages/Count ${n}/Kids [${pages.map((_,i)=>`${3+3*i} 0 R`).join(' ')}]>>`);
  pages.forEach((p,i)=>{
    const pg=3+3*i,ct=pg+1,im=pg+2,s=`q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(pg,`<</Type/Page/Parent 2 0 R/MediaBox [0 0 ${W} ${H}]/Resources<</XObject<</Im0 ${im} 0 R>>>>/Contents ${ct} 0 R>>`);
    obj(ct,`<</Length ${s.length}>>\nstream\n${s}\nendstream`);
    offs[im]=len;
    push(`${im} 0 obj\n<</Type/XObject/Subtype/Image/Width ${p.w}/Height ${p.h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${p.bytes.length}>>\nstream\n`);
    push(p.bytes);push('\nendstream\nendobj\n');
  });
  const total=3+3*n,x=len;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`+offs.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join(''));
  push(`trailer\n<</Size ${total}/Root 1 0 R>>\nstartxref\n${x}\n%%EOF`);
  return new Blob(parts,{type:'application/pdf'});
}
$('#l-pdf').addEventListener('click',async()=>{
  if(!needText())return;
  try{
    toast(t('toast_making_pdf','Making your PDF…'));
    await ensureFonts(letterText());
    const pages=[];
    for(const pg of layoutLetter(false)){
      const c=drawLetterPage(pg),b=await toBlob(c,'image/jpeg',.95);
      pages.push({w:c.width,h:c.height,bytes:new Uint8Array(await b.arrayBuffer())});
    }
    saveBlob('unwritten-letter-'+(L.date||todayISO())+'.pdf',await makePDF(pages));
    markToday();toast(t('toast_pdf_saved','PDF saved'));
  }catch(e){toast('Could not make the PDF. Try a shorter letter.')}
});
/* print: the pages are drawn into the page itself, and the print style shows only them */
$('#l-print').addEventListener('click',async()=>{
  if(!needText())return;
  await ensureFonts(letterText());
  const st=STYLES[L.style]||STYLES.hand;
  $('#print-root').replaceChildren(...layoutLetter(false).map(pg=>h('div',{class:'pp',style:'background:'+(PAPERS[L.paper]||PAPERS.cream)[1]},paperEl(pg,st))));
  markToday();
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  window.print();
});
addEventListener('afterprint',()=>$('#print-root').replaceChildren());
$('#l-copy').addEventListener('click',()=>copyText(letterText(),t('toast_letter_copied','Letter copied')));
/* "More" menu under the main Download PDF button */
const moreBtn=$('#l-more'),moreMenu=$('#l-more-menu');
function setMore(open){moreMenu.hidden=!open;moreBtn.setAttribute('aria-expanded',String(open))}
moreBtn.addEventListener('click',e=>{e.stopPropagation();setMore(moreMenu.hidden)});
moreMenu.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&b.id!=='l-new')setMore(false)});
document.addEventListener('click',e=>{if(!moreMenu.hidden&&!e.target.closest('.morewrap'))setMore(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!moreMenu.hidden){setMore(false);moreBtn.focus()}});
addEventListener('hashchange',()=>setMore(false));
armed($('#l-new'),t('clear_letter_confirm','Tap again to clear'),()=>{
  setMore(false);
  Object.assign(L,{greet:'Dear ',body:'',sign:'With love,',from:'',date:todayISO()});
  syncLetterInputs();renderLetter();$('#l-body').focus();toast(t('toast_fresh_ready','Fresh page ready'));
});

/* ---------- zen mode: the writing box fills the screen, nothing else ---------- */
function zenInit(id,key,opts={}){
  const ta=$('#'+id),field=ta.closest('.field');
  const extra=opts.extra?$(opts.extra).closest('.field'):null;       /* e.g. the "To" line, shown above the letter */
  const cnt=h('span',{class:'zencount'}),spot=document.createComment('zen'),spot2=document.createComment('zen2');
  const count=()=>{const n=(ta.value.trim().match(/\S+/g)||[]).length;cnt.textContent=n+(n===1?' '+t('word','word'):' '+t('words','words'))};
  const set=on=>{
    if(on===field.classList.contains('zen'))return;
    if(on){field.before(spot);document.body.append(field);if(extra){extra.before(spot2);ta.before(extra)}}
    else{if(extra)spot2.replaceWith(extra);spot.replaceWith(field)}
    field.classList.toggle('zen',on);document.body.style.overflow=on?'hidden':'';
    if(on){
      count();
      const ei=extra&&$('input',extra);
      const first=ei&&/^\s*dear\s*$/i.test(ei.value)?ei:ta;          /* a bare "Dear" invites a name first */
      first.focus();first.setSelectionRange(first.value.length,first.value.length);
    }
  };
  zens[key]=set;
  ta.addEventListener('input',count);
  if(extra)$('input',extra).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();ta.focus()}});
  field.addEventListener('keydown',e=>{if(e.key==='Escape'&&field.classList.contains('zen')){e.stopPropagation();set(false)}});
  field.append(
    h('button',{class:'zenbtn',type:'button','data-i18n':'zen_btn',onclick:()=>set(true)},t('zen_btn','☾ Zen mode')),
    h('div',{class:'zenbar'},cnt,h('button',{class:'btn ghost',type:'button','data-i18n':opts.done?'zen_done':'zen_exit',onclick:()=>set(false)},t(opts.done?'zen_done':'zen_exit',opts.done?'Done':'Exit zen'))));
}
zenInit('p-body','p');
zenInit('l-body','l',{extra:'#l-greet',done:true});

/* ---------- backup, restore, erase ---------- */
function backupData(){return{app:'liha',version:3,exportedAt:new Date().toISOString(),posts:mine,notes,letter:L,days:[...days].sort()}}
function readableBackup(){
  const out=['UNWRITTEN · '+fmt(todayISO()),'','== MY BLOG POSTS =='];
  if(!mine.length)out.push('(none yet)');
  mine.forEach(p=>out.push('',p.title+'  ('+fmt(p.date)+', '+(TAGS[p.tag]||p.tag)+')',p.body));
  out.push('','== STICKY NOTES ==');
  if(!notes.length)out.push('(none)');
  notes.forEach(n=>out.push('- '+n.t+(n.f?'  — '+n.f:'')));
  out.push('','== LETTER DRAFT ==',letterText());
  return out.join('\n');
}
$('#f-backup').addEventListener('click',()=>{saveText('unwritten-backup-'+todayISO()+'.json',JSON.stringify(backupData(),null,2),'application/json');toast(t('toast_backup_saved','Backup saved'))});
$('#f-text').addEventListener('click',()=>{saveText('unwritten-writing-'+todayISO()+'.txt',readableBackup());toast(t('toast_txt_saved','Readable copy saved'))});
$('#f-restore').addEventListener('click',()=>$('#restore-file').click());
$('#restore-file').addEventListener('change',async e=>{
  const file=e.target.files[0];e.target.value='';
  if(!file)return;
  try{
    if(file.size>20e6)throw new Error('too big');
    const data=JSON.parse(await file.text());
    if(!data||data.app!=='liha')throw new Error('not an UNWRITTEN backup');
    let np=0,nn=0;
    const pids=new Set(mine.map(p=>p.id)),nids=new Set(notes.map(n=>n.id));
    (Array.isArray(data.posts)?data.posts:[]).map(cleanPost).filter(Boolean).forEach(p=>{if(!pids.has(p.id)){mine.push(p);pids.add(p.id);np++}});
    (Array.isArray(data.notes)?data.notes:[]).map(cleanNote).filter(Boolean).forEach(n=>{if(!nids.has(n.id)){notes.push(n);nids.add(n.id);nn++}});
    (Array.isArray(data.days)?data.days:[]).filter(isDay).forEach(d=>days.add(d));
    Object.assign(L,cleanLetter(data.letter));
    savePosts();saveNotes();store.set(K.days,JSON.stringify([...days].sort().slice(-400)));
    syncLetterInputs();renderLetter();renderBlog();renderWall();renderStreak();
    toast('Restored '+np+' posts, '+nn+' notes and the letter');
  }catch(err){toast('That file is not an UNWRITTEN backup')}
});
/* Ctrl/Cmd + Enter posts from the big boxes */
[['#p-body','#post-form'],['#n-text','#note-form']].forEach(([a,f])=>$(a).addEventListener('keydown',e=>{
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();$(f).requestSubmit()}}));
/* the privacy window: opened from the footer or the login card */
{const box=$('#privacy');let back=null;
 const open=()=>{back=document.activeElement;box.hidden=false;$('#privacy-close').focus({preventScroll:true})};
 const close=()=>{box.hidden=true;if(back&&back.isConnected&&!back.hidden)back.focus({preventScroll:true})};
 ['#f-privacy','#a-privacy'].forEach(q=>$(q).addEventListener('click',open));
 $('#privacy-close').addEventListener('click',close);
 box.addEventListener('click',e=>{if(e.target===box)close()});
 addEventListener('keydown',e=>{if(e.key==='Escape'&&!box.hidden){e.preventDefault();e.stopPropagation();close()}},true)}
armed($('#f-erase'),t('f_erase_confirm','Tap again to erase everything'),async()=>{try{await window.LihaSync?.eraseCloud?.()}catch(e){}Object.values(K).forEach(store.del);location.reload()});
$('#f-why').addEventListener('click',()=>$('#why').scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'start'}));
$('#up').addEventListener('click',()=>window.scrollTo({top:0,behavior:reduceMotion()?'auto':'smooth'}));

const fl=$('#f-lang');
if(fl)fl.addEventListener('click',()=>{
  const next=curLang==='mr'?'en':'mr';
  store.set(K.lang,next);
  applyLang(next);
});
const tb=$('#theme-btn');
if(tb)tb.addEventListener('click',()=>{
  const next=!isDark();
  store.set(K.theme,next?'dark':'light');
  applyTheme(next);
});

/* ---------- works offline, installs like an app ---------- */
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol))addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
let installEv=null;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEv=e;$('#f-install').hidden=false});
$('#f-install').addEventListener('click',async()=>{
  if(!installEv)return;
  installEv.prompt();try{await installEv.userChoice}catch(e){}
  installEv=null;$('#f-install').hidden=true;
});
addEventListener('appinstalled',()=>{$('#f-install').hidden=true});

/* ---------- start ---------- */
/* ---------- soft wind: the same dot grid, drifting on a slow breeze ---------- */
(function wind(){
  const cv=document.createElement('canvas');cv.id='wind';cv.setAttribute('aria-hidden','true');
  document.body.prepend(cv);
  const cx=cv.getContext('2d');if(!cx)return;
  const still=matchMedia('(prefers-reduced-motion: reduce)');
  const GAP=26,AMP=7;            /* grid spacing, dot radius, drift distance (px) */
  let W=0,H=0,t=0,last=0,raf=0,rt=0,mx=-999,my=-999,push=0;
  function size(){                              /* phones: the address bar changes the height while scrolling; ignore that */
    const w=innerWidth,h=innerHeight;
    if(w===W&&h<=H)return;
    if(w!==W)H=0;
    const dpr=Math.min(devicePixelRatio||1,2);W=w;H=Math.max(H,h);
    cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
    cv.style.width=W+'px';cv.style.height=H+'px';
    cx.setTransform(dpr,0,0,dpr,0,0);
  }
  function draw(){
    cx.clearRect(0,0,W,H);
    const ph_=lowPower.matches,R=ph_?2:1.5;                /* phones: a touch bigger and darker so the dots read on small screens */
    cx.fillStyle=document.documentElement.dataset.theme==='dark'?(ph_?'rgba(255,255,255,.24)':'rgba(255,255,255,.16)'):(ph_?'rgba(42,11,11,.32)':'rgba(42,11,11,.22)');
    cx.beginPath();
    for(let gy=GAP/2;gy<H+GAP;gy+=GAP)for(let gx=GAP/2;gx<W+GAP;gx+=GAP){
      const ph=gx*.006+gy*.009-t*.5;                    /* a slow wave travelling diagonally */
      let x=gx+AMP*Math.cos(ph),y=gy+AMP*.6*Math.sin(ph);
      if(push>.01){                                     /* cursor gently parts the dots */
        const dx=x-mx,dy=y-my,d2=dx*dx+dy*dy;
        if(d2<14400){const d=Math.sqrt(d2)||1,k=(1-d/120)*push*9;x+=dx/d*k;y+=dy/d*k}
      }
      cx.moveTo(x+R,y);cx.arc(x,y,R,0,6.2832);
    }
    cx.fill();
  }
  const lowPower=matchMedia('(max-width:700px),(pointer:coarse)');   /* phones: about 30 frames a second is plenty for a slow drift */
  function frame(ts){
    raf=requestAnimationFrame(frame);
    if(lowPower.matches&&last&&ts-last<30)return;
    const dt=Math.min(.05,(ts-(last||ts))/1000);last=ts;
    t+=dt;push+=((mx>-900?1:0)-push)*Math.min(1,dt*2);
    draw();
  }
  function run(){
    cancelAnimationFrame(raf);raf=0;last=0;
    if(still.matches||document.hidden){draw();return}
    raf=requestAnimationFrame(frame);
  }
  size();run();
  addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{size();run()},150)});
  document.addEventListener('visibilitychange',run);
  still.addEventListener('change',run);
  addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;mx=e.clientX;my=e.clientY},{passive:true});
  document.addEventListener('pointerleave',()=>{mx=my=-999});
  new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
})();

initTheme();
applyLang(curLang);
showPrompt();renderStreak();renderBlog();renderWall();syncLetterInputs();renderLetter();route();
if(document.fonts){document.fonts.ready.then(queueLetter);document.fonts.addEventListener?.('loadingdone',queueLetter)}
})();
