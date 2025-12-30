async function K(e,t,o){var y,b,u,E,c;if(t.length===0)return{shouldReply:!1,reason:"Empty conversation"};const n=t[t.length-1],s=n.message.toLowerCase(),a=t.filter(i=>i.speaker!==o),r=t.filter(i=>i.speaker===o);if(a.length>0){const i=a[a.length-1],x=i.message.includes("?"),f=r[r.length-1]===n,S=t.findIndex(L=>L===i),R=t.length-1;if(x&&f&&R>S)return{shouldReply:!0,reason:"They answered my question - must acknowledge and continue"}}const d=n.message.split(" ").length<20,m=a.length>0&&r.length>0;if(d&&m&&a.length>=2)return{shouldReply:!0,reason:"Short but engaged response - continuing conversation flow"};if(["not interested","no thanks","not right now","too busy right now","maybe later","not a fit","not looking","thanks but no","appreciate it but","not what we need","have a great day","talk soon","take care","bye","goodbye","gotta go","catch you later"].some(i=>s.includes(i)))return{shouldReply:!1,reason:"Lead explicitly disengaged or ended conversation"};if(["yes","yeah","sure","absolutely","definitely","interested","sounds good","tell me more","how does","what about","can you","could you","would love to","want to know","curious about","?"].some(i=>s.includes(i)))return{shouldReply:!0,reason:"Positive engagement detected - they're interested"};const $=`You are analyzing a LinkedIn conversation to decide if a response is needed.

CONVERSATION (last 20 messages):
${t.slice(-20).map(i=>`${i.speaker}: ${i.message}`).join(`
`)}

CONTEXT: The lead just sent: "${n.message}"

Analyze if you should reply:

REPLY if:
- They asked a question (even indirectly)
- They shared useful information expecting feedback
- They answered YOUR question and conversation should continue
- They showed interest or curiosity
- Natural conversation flow requires acknowledgment

SKIP ONLY if:
- They gave a hard "no" or clear rejection
- They said goodbye and closed the conversation
- They gave a pure acknowledgment with no follow-up needed (like "ok thanks")
- Replying would seem pushy after their closure statement

Respond ONLY with this format:
REPLY: [one sentence reason]
OR
SKIP: [one sentence reason]

Be biased toward REPLY unless there's clear disengagement.`;try{const i=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${e}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"user",content:$}],temperature:.2,max_tokens:60})});if(!i.ok)return{shouldReply:!0,reason:"AI check failed - defaulting to reply"};const f=((E=(u=(b=(y=(await i.json()).choices)==null?void 0:y[0])==null?void 0:b.message)==null?void 0:u.content)==null?void 0:E.trim())||"",S=f.toUpperCase().startsWith("REPLY"),R=((c=f.split(":")[1])==null?void 0:c.trim())||"AI decision";return{shouldReply:S,reason:R}}catch(i){return console.error("❌ AI decision check failed:",i),{shouldReply:!0,reason:"AI error - defaulting to engage"}}}async function Y(e,t,o){var s,a,r,d;const n=`You are an AI assistant helping identify qualified leads.
Rule: ${t}
Analyze the following two LinkedIn messages: ${o.join(`
`)}
Respond with only one word: "yes" or "no".`;try{return((d=(r=(a=(s=(await(await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${e}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"user",content:n}],temperature:0,max_tokens:10})})).json()).choices)==null?void 0:s[0])==null?void 0:a.message)==null?void 0:r.content)==null?void 0:d.trim().toLowerCase())==="yes"}catch(m){return console.error("❌ GPT lead check failed:",m),!1}}async function z(e,t,o){const n="re_V2cc9Nqe_2QaLJuLneRiYKEHAnmFGaEc2";try{const s=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${n}`,"Content-Type":"application/json"},body:JSON.stringify({from:"LinkedIn AI Bot <onboarding@resend.dev>",to:[o],subject:`🔥 Hot Lead: ${e}`,html:`
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #0066cc; border-bottom: 3px solid #0066cc; padding-bottom: 10px;">
              🎯 New Qualified Lead Alert
            </h1>
            
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h2 style="color: #333; margin-top: 0;">Lead Name</h2>
              <p style="font-size: 18px; font-weight: bold; color: #0066cc;">${e}</p>
            </div>

            <div style="background: white; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
              <h2 style="color: #333;">Conversation History</h2>
              <div style="white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 14px; line-height: 1.6; background: #f9f9f9; padding: 15px; border-left: 4px solid #0066cc; overflow-x: auto;">
${t}
              </div>
            </div>

            <div style="margin-top: 30px; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; text-align: center;">
              <h3 style="margin: 0 0 10px 0;">Next Steps</h3>
              <p style="margin: 0; font-size: 14px;">
                Review the conversation and follow up with <strong>${e}</strong> on LinkedIn.
              </p>
            </div>

            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px;">
              <p>Sent by LinkedIn AI Responder</p>
              <p>Automated lead notification system</p>
            </div>
          </div>
        `})});if(!s.ok){const r=await s.json();throw console.error("❌ Resend API error:",r),new Error(`Resend API error: ${s.status}`)}const a=await s.json();return console.log("✅ Email sent via Resend:",a),a}catch(s){throw console.error("❌ Email send failed:",s),s}}let M=!1,C=null,k={chatsProcessed:0,repliesSent:0,leadsFound:0,startTime:null,tokensUsed:0,currentModel:""},O=[],D=!0,_=!1,q="llama-3.3-70b-versatile";function l(e,t,o){const n={time:Date.now(),type:e,message:t,actor:o};O.unshift(n),O.length>100&&O.pop(),chrome.storage.local.set({botLog:O.slice(0,50)})}function P(e,t){e==="startTime"?k.startTime=t:e==="tokensUsed"?k.tokensUsed=t:e==="currentModel"?k.currentModel=t:k[e]+=t}function h(e){return new Promise(t=>setTimeout(t,e))}function G(e){return 2e3+e.split(" ").length*300+Math.random()*2e3}function W(e=9,t=18){const o=new Date().getHours();return o>=e&&o<t}async function J(e,t){e.focus(),document.execCommand("selectAll",!1,""),document.execCommand("delete",!1,"");for(const o of t){document.execCommand("insertText",!1,o);const n=Math.random()>.9?150:30+Math.random()*50;await h(n)}}async function Q(){const e=document.querySelector(".msg-s-message-list-content");if(!e)return;const t=Math.random()*80+20;e.scrollBy(0,t),await h(300+Math.random()*500),e.scrollBy(0,-(Math.random()*50+10)),await h(300+Math.random()*500)}async function V(e=5){const t=document.querySelector(".msg-conversations-container--inbox-shortcuts");if(t)for(let o=0;o<e;o++)t.scrollBy({top:Math.random()*200+100,behavior:"smooth"}),await h(500+Math.random()*800),t.scrollBy({top:-(Math.random()*50),behavior:"smooth"}),await h(400+Math.random()*500)}async function X(){return new Promise(e=>{chrome.storage.local.get(["openaiApiKey","groqApiKey","chatMinDelay","chatMaxDelay","loopMinDelay","loopMaxDelay","replyPrompt","leadPrompt","targetEmail","startHour","endHour"],t=>e({apiKey:t.openaiApiKey,groqApiKey:t.groqApiKey||"",chatMin:t.chatMinDelay||1e3,chatMax:t.chatMaxDelay||2500,loopMin:t.loopMinDelay||3e3,loopMax:t.loopMaxDelay||6e3,prompt:t.replyPrompt||"Reply briefly:",leadPrompt:t.leadPrompt||"Interested lead",targetEmail:t.targetEmail||"",startHour:t.startHour||9,endHour:t.endHour||18}))})}function Z(){var t;const e=document.evaluate('//*[@id="thread-detail-jump-target"]/div/a/div/dl/dt/h2',document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;return((t=e==null?void 0:e.textContent)==null?void 0:t.trim())||null}function ee(e){var o,n;const t=Array.from(document.querySelectorAll("li.msg-s-message-list__event"));for(let s=t.length-1;s>=0;s--){const a=t[s],r=a.querySelector("span.msg-s-message-group__name"),d=a.querySelector("p.msg-s-event-listitem__body");if(r&&d){const m=((o=r.textContent)==null?void 0:o.trim())||"",g=((n=d.textContent)==null?void 0:n.trim())||"";if(!g)continue;return{fromLead:m.includes(e),content:g}}}return null}function te(){var o,n;const e=Array.from(document.querySelectorAll("li.msg-s-message-list__event")),t=[];for(const s of e){const a=s.querySelector("span.msg-s-message-group__name"),r=s.querySelector("p.msg-s-event-listitem__body");a&&r&&t.push({speaker:((o=a.textContent)==null?void 0:o.trim())||"Unknown",message:((n=r.textContent)==null?void 0:n.trim())||""})}return t}async function oe(e,t,o,n,s,a=!1,r="llama-3.3-70b-versatile"){var y,b;const d=o.map(u=>`${u.speaker}: ${u.message}`).join(`
`),m=`You are a professional LinkedIn user. Write like a human (brief, casual).
Context:
${d}
${t.replace("{extracted_text}",d).replace("{user_name}",n)}
Respond as ${s}.`,g=a?"https://api.groq.com/openai/v1/chat/completions":"https://api.openai.com/v1/chat/completions",A=a?r:"gpt-4o-mini";let w=150;a&&(r==="openai/gpt-oss-120b"?w=500:w=250);const v=await fetch(g,{method:"POST",headers:{Authorization:`Bearer ${e}`,"Content-Type":"application/json"},body:JSON.stringify({model:A,messages:[{role:"system",content:m},...o.slice(-20).map(u=>({role:u.speaker===n?"user":"assistant",content:u.message}))],max_tokens:w,temperature:.7})});if(!v.ok)throw new Error(`${a?"Groq":"OpenAI"} API Error`);const T=await v.json(),$=(((y=T.usage)==null?void 0:y.prompt_tokens)||0)+(((b=T.usage)==null?void 0:b.completion_tokens)||0);return{reply:T.choices[0].message.content.trim(),tokensUsed:$}}function ne(){var t;const e=document.querySelector(".global-nav__me-content span");return((t=e==null?void 0:e.textContent)==null?void 0:t.trim())||"You"}function j(e){return{"openai/gpt-oss-120b":"GPT-OSS-120B","llama-3.3-70b-versatile":"Llama-3.3-70B","meta-llama/llama-4-scout-17b-16e-instruct":"Llama-4-Scout","meta-llama/llama-4-maverick-17b-128e-instruct":"Llama-4-Maverick","moonshotai/kimi-k2-instruct-0905":"Kimi-K2","qwen/qwen3-32b":"Qwen-3-32B","gpt-4o-mini":"GPT-4o-mini","gpt-4o":"GPT-4o"}[e]||e}async function B(e){var b;l("INFO",`Starting batch of ${e} chats...`,"System");const{apiKey:t,groqApiKey:o,chatMin:n,chatMax:s,loopMin:a,loopMax:r,prompt:d,leadPrompt:m,targetEmail:g,startHour:A,endHour:w}=await X(),v=_?o:t,T=_?q:"gpt-4o-mini";if(P("currentModel",j(T)),D&&!W(A,w)){l("WARNING",`Outside working hours (${A}-${w}). Pausing.`,"System"),M&&(C=window.setTimeout(()=>B(e),15*60*1e3));return}const $=ne();await V(5);let y=Array.from(document.querySelectorAll("ul.msg-conversations-container__conversations-list li")).slice(0,e).sort(()=>Math.random()-.2);l("INFO",`Found ${y.length} conversations to check.`,"Bot");for(let u=0;u<y.length&&M;u++){await Q(),await H(n,s);const E=y[u].querySelector("a, .msg-conversation-listitem__link, [tabindex='0']");E==null||E.click(),await h(2e3);const c=Z();if(!c)continue;l("INFO",`Checking chat with ${c}...`,"Bot"),P("chatsProcessed",1);const i=ee(c);if(!i||!i.fromLead){l("INFO",`Skipping ${c}: Last message was from me.`,"Bot");continue}const x=te();if(x.length===0)continue;let f;try{f=await K(v,x,c),l("ACTION",`AI Decision for ${c}: ${f.shouldReply?"REPLY":"SKIP"} (${f.reason})`,"Bot")}catch(p){l("ERROR",`AI Decision Failed: ${N(p)}`,"System");continue}if(!f.shouldReply)continue;if(g)try{const p=x.slice(-2).map(I=>I.message);if(await Y(v,m,p)){const I=x.map(U=>`${U.speaker}: ${U.message}`).join(`
`);await z(c,I,g),P("leadsFound",1),l("SUCCESS",`HOT LEAD FOUND: ${c}. Email sent!`,"Bot")}}catch(p){l("ERROR",`Lead check failed: ${N(p)}`,"System")}let S;try{S=await oe(v,d,x,c,$,_,q),P("tokensUsed",k.tokensUsed+S.tokensUsed)}catch(p){l("ERROR",`Reply Generation Failed: ${N(p)}`,"System");continue}const R=document.querySelector("div.msg-form__contenteditable[role='textbox']"),L=document.querySelector("button.msg-form__send-button");if(R&&L){const p=G(S.reply);l("ACTION",`Typing reply to ${c} (waiting ${Math.round(p/1e3)}s)...`,"Bot"),await h(p),await J(R,S.reply),await h(800),L.hasAttribute("disabled")||L.classList.contains("disabled")?l("ERROR",`Send button disabled for ${c} - message might be empty or invalid`,"System"):(L.click(),await h(500),(((b=R.textContent)==null?void 0:b.trim())||"").length>0?l("WARNING",`Message may not have sent to ${c} - input not cleared`,"System"):(P("repliesSent",1),l("SUCCESS",`Sent reply to ${c} (${j(T)})`,"Bot")))}else l("ERROR","Could not find chat input box","System");await H(n,s)}l("INFO","Batch finished. Sleeping...","System"),M&&(C=window.setTimeout(()=>B(e),Math.floor(Math.random()*(r-a+1))+a))}function H(e,t){return h(Math.floor(Math.random()*(t-e+1))+e)}function N(e){return typeof e=="string"?e:e&&typeof e=="object"&&"message"in e?e.message:"Unknown error"}chrome.runtime.onMessage.addListener((e,t,o)=>{var n,s,a,r;if(e.type==="PING_TEST"){o("✅ Content script active!");return}if(e.type==="GET_STATUS"){o({running:M,stats:k,logs:O});return}if(e.type==="START_BOT"){M?o({status:"error",error:"Already running"}):(M=!0,k.startTime=Date.now(),k.tokensUsed=0,D=((n=e.config)==null?void 0:n.strictHours)??!0,_=((s=e.config)==null?void 0:s.useGroq)??!1,q=((a=e.config)==null?void 0:a.groqModel)??"llama-3.3-70b-versatile",l("INFO",`Bot started (Provider: ${_?"Groq":"OpenAI"}, Strict Hours: ${D?"ON":"OFF"})`,"User"),B(((r=e.config)==null?void 0:r.nChats)??10),o({status:"ok"}));return}if(e.type==="STOP_BOT"){M=!1,C!==null&&clearTimeout(C),l("INFO","Bot stopped by user","User"),o({status:"stopped"});return}});
