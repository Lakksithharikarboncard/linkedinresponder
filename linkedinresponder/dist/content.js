async function O(e,t,o){var r,i,m,c,l;const n=`You are an AI assistant analyzing LinkedIn conversations to decide if a response is appropriate.

CONVERSATION CONTEXT:
${t.slice(-8).map(u=>`${u.speaker}: ${u.message}`).join(`
`)}

ANALYZE and determine if "${o}" needs a response based on these rules:

REPLY if:
- They asked a question
- They shared information expecting feedback
- Conversation is ongoing and natural to continue
- They expressed interest in something you mentioned
- They're waiting for your input or decision

DO NOT REPLY if:
- They said goodbye/thanks and closed conversation (e.g., "thanks, bye!", "talk soon!", "have a great day")
- They gave a simple acknowledgment (e.g., "ok", "got it", "sounds good")
- Conversation naturally concluded
- They didn't ask anything or expect a response
- Replying would seem pushy or forced
- They're clearly ending the chat

Respond with ONLY ONE WORD followed by a brief reason:
Format: REPLY: [reason] OR SKIP: [reason]

Example responses:
- "REPLY: They asked about pricing"
- "SKIP: They said thanks and goodbye"
- "REPLY: They want to schedule a call"
- "SKIP: Conversation naturally ended"`;try{const h=((c=(m=(i=(r=(await(await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${e}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"user",content:n}],temperature:.3,max_tokens:50})})).json()).choices)==null?void 0:r[0])==null?void 0:i.message)==null?void 0:m.content)==null?void 0:c.trim())||"",w=h.toUpperCase().startsWith("REPLY"),s=((l=h.split(":")[1])==null?void 0:l.trim())||"AI decision";return{shouldReply:w,reason:s}}catch(u){return console.error("❌ AI decision check failed:",u),{shouldReply:!1,reason:"Error in decision making"}}}async function $(e,t,o){var n,r,i,m;const a=`You are an AI assistant helping identify qualified leads.
Rule: ${t}
Analyze the following two LinkedIn messages: ${o.join(`
`)}
Respond with only one word: "yes" or "no".`;try{return((m=(i=(r=(n=(await(await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${e}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"user",content:a}],temperature:0,max_tokens:10})})).json()).choices)==null?void 0:n[0])==null?void 0:r.message)==null?void 0:i.content)==null?void 0:m.trim().toLowerCase())==="yes"}catch(c){return console.error("❌ GPT lead check failed:",c),!1}}async function q(e,t,o){const a="re_V2cc9Nqe_2QaLJuLneRiYKEHAnmFGaEc2";try{const n=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${a}`,"Content-Type":"application/json"},body:JSON.stringify({from:"LinkedIn AI Bot <onboarding@resend.dev>",to:[o],subject:`🔥 Hot Lead: ${e}`,html:`
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
        `})});if(!n.ok){const i=await n.json();throw console.error("❌ Resend API error:",i),new Error(`Resend API error: ${n.status}`)}const r=await n.json();return console.log("✅ Email sent via Resend:",r),r}catch(n){throw console.error("❌ Email send failed:",n),n}}let v=!1,S=null;function k(e){return typeof e=="string"?e:e&&typeof e=="object"&&"message"in e?e.message:"Unknown error"}function d(e,t){chrome.storage.local.get(["botLog"],o=>{const a=o.botLog||[];a.unshift({time:Date.now(),type:e,detail:t}),chrome.storage.local.set({botLog:a.slice(0,50)})})}function f(e){return new Promise(t=>setTimeout(t,e))}function T(e,t){const o=Math.floor(Math.random()*(t-e+1))+e;return f(o)}async function j(e,t){e.focus(),document.execCommand("selectAll",!1,""),document.execCommand("delete",!1,"");for(const o of t)document.execCommand("insertText",!1,o),await f(50+Math.random()*150)}async function E(){const e=document.querySelector(".msg-s-message-list-content");if(!e)return;const t=Math.random()*80+20;e.scrollBy(0,t),await f(300+Math.random()*500),e.scrollBy(0,-(Math.random()*50+10)),await f(300+Math.random()*500)}async function A(e=5){const t=document.querySelector(".msg-conversations-container--inbox-shortcuts");if(!t){console.warn("Conversation container not found");return}for(let o=0;o<e;o++){const a=Math.random()*200+100;t.scrollBy({top:a,behavior:"smooth"}),await f(500+Math.random()*800);const n=Math.random()*50;t.scrollBy({top:-n,behavior:"smooth"}),await f(400+Math.random()*500)}}async function B(){return new Promise(e=>{chrome.storage.local.get(["openaiApiKey","chatMinDelay","chatMaxDelay","loopMinDelay","loopMaxDelay","replyPrompt","leadPrompt","targetEmail"],t=>e({apiKey:t.openaiApiKey,chatMin:t.chatMinDelay||1e3,chatMax:t.chatMaxDelay||2500,loopMin:t.loopMinDelay||3e3,loopMax:t.loopMaxDelay||6e3,prompt:t.replyPrompt||"Reply briefly and professionally to this LinkedIn message:",leadPrompt:t.leadPrompt||"Does the user seem interested or did they share contact details?",targetEmail:t.targetEmail||""}))})}function R(){var t;const e=document.evaluate('//*[@id="thread-detail-jump-target"]/div/a/div/dl/dt/h2',document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;return((t=e==null?void 0:e.textContent)==null?void 0:t.trim())||null}function I(e){var o,a;const t=Array.from(document.querySelectorAll("li.msg-s-message-list__event"));for(let n=t.length-1;n>=0;n--){const r=t[n],i=r.querySelector("span.msg-s-message-group__name"),m=r.querySelector("p.msg-s-event-listitem__body");if(i&&m){const c=((o=i.textContent)==null?void 0:o.trim())||"",l=((a=m.textContent)==null?void 0:a.trim())||"";if(!l)continue;return{fromLead:c.includes(e),content:l}}}return null}function Y(){var o,a;const e=Array.from(document.querySelectorAll("li.msg-s-message-list__event")),t=[];for(const n of e){const r=n.querySelector("span.msg-s-message-group__name"),i=n.querySelector("p.msg-s-event-listitem__body");if(r&&i){const m=((o=r.textContent)==null?void 0:o.trim())||"Unknown",c=((a=i.textContent)==null?void 0:a.trim())||"";c&&t.push({speaker:m,message:c})}}return t}function F(){const e=document.querySelector("ul.msg-s-message-list-content");return e?Array.from(e.children).map(t=>{var o;return((o=t.textContent)==null?void 0:o.replace(/\s+/g," ").trim())||""}).filter(Boolean).join(`
`):""}async function K(e,t,o,a,n="You"){const r=o.map(p=>`${p.speaker}: ${p.message}`).join(`
`),c={model:"gpt-4o-mini",messages:[{role:"system",content:`You are a professional LinkedIn user having a natural conversation. 

IMPORTANT RULES:
- Write like a real person, not a formal AI assistant
- Keep responses brief (1-3 sentences max)
- Match the tone and formality of the conversation
- Use casual language when appropriate (e.g., "sounds great!", "happy to help")
- Avoid corporate jargon and robotic phrases like "I hope this message finds you well"
- Don't use excessive emojis unless the other person does
- Reference specific details from the conversation to show you're paying attention
- Ask follow-up questions when natural
- Use contractions (I'm, you're, that's) to sound more natural

Current conversation context:
${r}

${t.replace("{extracted_text}",r).replace("{user_name}",a)}

Respond as ${n} in a natural, conversational way.`},...o.slice(-10).map(p=>({role:p.speaker===a?"user":"assistant",content:p.message}))],max_tokens:150,temperature:.7,presence_penalty:.6,frequency_penalty:.3},l=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${e}`,"Content-Type":"application/json"},body:JSON.stringify(c)});if(!l.ok){const p=await l.text();throw new Error(`OpenAI API error: ${l.status} - ${p}`)}return(await l.json()).choices[0].message.content.trim()}function z(e){return e.split(`
`).map(t=>t.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C-\uDBFF\uDC00-\uDFFF]|[\u2600-\u26FF])/g,"").replace(/\s+/g," ").trim()).filter(t=>t.length>0).join(`
`)}function U(){var t;document.querySelector(".global-nav__me-photo");const e=document.querySelector(".global-nav__me-content span");return((t=e==null?void 0:e.textContent)==null?void 0:t.trim())||"You"}async function N(e){const t=e-1;d("started",{N:t});const{apiKey:o,chatMin:a,chatMax:n,loopMin:r,loopMax:i,prompt:m,leadPrompt:c,targetEmail:l}=await B(),u=U();await A(5);let p=Array.from(document.querySelectorAll("ul.msg-conversations-container__conversations-list li")).slice(0,e).sort(()=>Math.random()-.2);await E(),await A(11);for(let h=0;h<p.length&&v;h++){await E(),await A(11),await T(a,n);const w=p[h].querySelector("a, .msg-conversation-listitem__link, [tabindex='0']");w==null||w.click(),await T(1500,2500);const s=R();if(!s){d("skipped",{reason:"No lead name found"});continue}const M=I(s);if(!M||!M.fromLead){d("skipped",{lead:s,reason:"No new message from lead"});continue}const _=Y();if(_.length===0){d("skipped",{lead:s,reason:"Empty conversation"});continue}let g;try{g=await O(o,_,s),d("ai_decision",{lead:s,decision:g.shouldReply?"REPLY":"SKIP",reason:g.reason})}catch(y){d("error",{lead:s,error:"AI decision failed: "+k(y)});continue}if(!g.shouldReply){d("skipped_by_ai",{lead:s,reason:g.reason});continue}const D=F(),C=Array.from(document.querySelectorAll("li.msg-s-message-list__event")).reverse().map(y=>{var x;return(x=y.textContent)==null?void 0:x.trim()}).filter(Boolean).slice(0,2);if(C.length===2&&l)try{if(await $(o,c,C)){const x=z(D);await q(s,x,l),d("positive_lead_email_sent",{lead:s})}}catch(y){d("positive_lead_email_failed",{lead:s,error:k(y)})}let b;try{b=await K(o,m,_,s,u)}catch(y){d("error",{lead:s,error:"Reply generation failed: "+k(y)});continue}const P=document.querySelector("div.msg-form__contenteditable[role='textbox']"),L=document.querySelector("button.msg-form__send-button");P&&L?(await j(P,b),await f(500+Math.random()*1e3),L.click(),d("replied",{lead:s,reply:b,ai_reason:g.reason})):d("error",{lead:s,error:"Send UI not found"}),await T(a,n),h>0&&h%5===0&&await E()}d("finished iteration"),v&&(S=window.setTimeout(()=>N(e),Math.floor(Math.random()*(i-r+1))+r))}chrome.runtime.onMessage.addListener((e,t,o)=>{switch(e.type){case"PING_TEST":o("✅ Content script active!");return;case"START_BOT":v?o({status:"error",error:"Bot already running"}):(v=!0,N(e.n),o({status:"ok"}));return;case"STOP_BOT":v=!1,S!==null&&clearTimeout(S),d("stopped"),o({status:"stopped"});return;case"CHECK_UNREAD":{const a=R(),n=a?I(a):null;a&&(n!=null&&n.fromLead)&&chrome.runtime.sendMessage({type:"NEW_MESSAGE",payload:{chatId:a,messageText:n.content}}),o({status:"checked"});return}default:o({status:"error",error:"Unknown command"});return}});
