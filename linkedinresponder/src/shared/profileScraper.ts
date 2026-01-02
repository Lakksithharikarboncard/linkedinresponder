import { LeadProfile } from "./types";

const SELECTORS = {
  headline: [
    '.pv-text-details__left-panel h2',
    '.text-body-medium.break-words',
    'div[data-view-name="profile-headline"]',
    '.pv-top-card--list-bullet .text-body-small'
  ],
  jobTitle: [
    '.pv-text-details__left-panel .text-body-small:first-of-type',
    '.pv-top-card--list-bullet .text-body-small:first-child'
  ],
  company: [
    '.pv-text-details__left-panel .text-body-small.inline a',
    'a[data-field="experience_company_logo"]',
    '.experience-item__company'
  ],
  location: [
    '.pv-text-details__left-panel .text-body-small:last-of-type',
    'span.text-body-small.inline.t-black--light.break-words',
    '.pv-top-card--list-bullet .text-body-small:last-child'
  ],
  connectionDegree: [
    '.dist-value',
    'span.dist-value',
    '.pv-top-card--list-bullet span.dist-value'
  ]
};

function getTextFromSelectors(selectors: string[]): string {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element?.textContent?.trim()) {
      return element.textContent.trim();
    }
  }
  return "";
}

function extractHeadline(): string {
  let headline = getTextFromSelectors(SELECTORS.headline);
  
  if (!headline) {
    const sidebarHeadline = document.querySelector('.msg-thread__link-to-profile')?.textContent?.trim();
    if (sidebarHeadline) headline = sidebarHeadline;
  }
  
  return headline || "No headline available";
}

function extractJobTitle(): string {
  return getTextFromSelectors(SELECTORS.jobTitle) || "Unknown";
}

function extractCompany(): string {
  let company = getTextFromSelectors(SELECTORS.company);
  company = company.replace(/^at\s+/i, '').trim();
  return company || "Unknown";
}

function extractLocation(): string {
  return getTextFromSelectors(SELECTORS.location) || "Unknown";
}

function extractConnectionDegree(): string {
  let degree = getTextFromSelectors(SELECTORS.connectionDegree);
  const match = degree.match(/(\d+(?:st|nd|rd|th))/);
  if (match) return match[1];
  return degree || "Unknown";
}

export function scrapeLeadProfile(): LeadProfile {
  const profile: LeadProfile = {
    headline: extractHeadline(),
    jobTitle: extractJobTitle(),
    company: extractCompany(),
    location: extractLocation(),
    connectionDegree: extractConnectionDegree(),
    lastScraped: Date.now()
  };
  
  return profile;
}

export function formatProfileForDisplay(leadName: string, profile: LeadProfile | null): string {
  if (!profile) return leadName;
  
  const parts: string[] = [];
  
  if (profile.jobTitle && profile.jobTitle !== "Unknown") {
    parts.push(profile.jobTitle);
  }
  
  if (profile.company && profile.company !== "Unknown") {
    parts.push(`@ ${profile.company}`);
  }
  
  if (profile.location && profile.location !== "Unknown") {
    parts.push(profile.location);
  }
  
  const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return `${leadName}${suffix}`;
}

export function formatProfileForAI(profile: LeadProfile | null): string {
  if (!profile) return "Profile: Not available";
  
  const parts: string[] = [];
  
  if (profile.headline && profile.headline !== "No headline available") {
    parts.push(`Headline: ${profile.headline}`);
  }
  
  if (profile.jobTitle && profile.jobTitle !== "Unknown") {
    parts.push(`Job Title: ${profile.jobTitle}`);
  }
  
  if (profile.company && profile.company !== "Unknown") {
    parts.push(`Company: ${profile.company}`);
  }
  
  if (profile.location && profile.location !== "Unknown") {
    parts.push(`Location: ${profile.location}`);
  }
  
  if (profile.connectionDegree && profile.connectionDegree !== "Unknown") {
    parts.push(`Connection: ${profile.connectionDegree}`);
  }
  
  return parts.join(" | ");
}
