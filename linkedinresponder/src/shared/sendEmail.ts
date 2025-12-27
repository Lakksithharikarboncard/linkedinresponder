// import emailjs from '@emailjs/browser';

// const SERVICE_ID = 'service_bsl5hzq';
// const TEMPLATE_ID = 'template_d2yr0kr';
// const PUBLIC_KEY = 'w6o_ed394nleoRcX8';

// export async function sendEmail(leadName: string, fullConversation: string, recipient: string) {
//   try {
//     const result = await emailjs.send(
//       SERVICE_ID,
//       TEMPLATE_ID,
//       {
//         lead_name: leadName,
//         conversation: fullConversation,
//         to_email: recipient,
//       },
//       PUBLIC_KEY
//     );
//     console.log("✅ Email sent:", result.text);
//   } catch (error) {
//     console.error("❌ Failed to send email:", error);
//   }
// }

// async function isPositiveLead(messages: string[], prompt: string, apiKey: string): Promise<boolean> {
//   const lastTwo = messages.slice(-2).join('\n');

//   const systemPrompt = `You are a classifier that decides if a LinkedIn chat satisfied the criteria : {${prompt}}. Only reply with 'positive' or 'negative'.`;
//   const userPrompt = `${lastTwo}`;

//   try {
//     const response = await fetch("https://api.openai.com/v1/chat/completions", {
//       method: "POST",
//       headers: {
//         Authorization: `Bearer ${apiKey}`,
//         "Content-Type": "application/json"
//       },
//       body: JSON.stringify({
//         model: "gpt-4",
//         messages: [
//           { role: "system", content: systemPrompt },
//           { role: "user", content: userPrompt }
//         ],
//         temperature: 0,
//         max_tokens: 10
//       })
//     });

//     const data = await response.json();
//     const content = data.choices?.[0]?.message?.content?.trim().toLowerCase();
//     return content === 'positive';
//   } catch (error) {
//     console.error("❌ GPT error while checking lead status:", error);
//     return false;
//   }
// }

// export async function sendEmailIfPositive(
//   allMessages: string[],
//   recipientEmail: string,
//   criteriaPrompt: string,
//   leadName: string
// ) {
//   const fullConversation = allMessages.join("\n");

//   return new Promise<void>((resolve) => {
//     chrome.storage.local.get(["openaiApiKey"], async (res) => {
//       const apiKey = res.openaiApiKey;
//       if (!apiKey || !criteriaPrompt || !recipientEmail) return resolve();

//       const isPositive = await isPositiveLead(allMessages, criteriaPrompt, apiKey);
//       if (isPositive) {
//         await sendEmail(leadName, fullConversation, recipientEmail);
//       } else {
//         console.log("⚠️ Not a positive lead. No email sent.");
//       }

//       resolve();
//     });
//   });
// }


import emailjs from "@emailjs/browser";

// GPT-4 OpenAI API (use securely in production)
export async function checkPositiveLead(
  apiKey: string,
  leadPrompt: string,
  lastTwoMessages: string[]
): Promise<boolean> {
  const prompt = `
You are an AI assistant helping identify qualified leads.
Rule: ${leadPrompt}
Analyze the following two LinkedIn messages based on Rule : ${lastTwoMessages}
Respond with only one word: "yes" or "no".
`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    });

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim().toLowerCase();
    return reply === "yes";
  } catch (err) {
    console.error("❌ GPT-4 lead check failed:", err);
    return false;
  }
}

export async function sendLeadAlertEmail(
  leadName: string,
  conversation: string,
  recipientEmail: string
) {
  try {
    const response = await emailjs.send(
      "service_bsl5hzq",      // replace with your EmailJS service ID
      "template_d2yr0kr",     // replace with your EmailJS template ID
      {
        lead_name: leadName,
        conversation: conversation,
        email: recipientEmail,
      },
      "w6o_ed394nleoRcX8"        // replace with your EmailJS public key
    );

    console.log("✅ Email sent via EmailJS:", response.status, response.text);
  } catch (error) {
    console.error("❌ Email send failed:", error);
  }
}



