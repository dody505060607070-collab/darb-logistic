export const CONTACT_LOCATION = { city: 'الرياض', country: 'المملكة العربية السعودية' };
export function legalHead(title: string, description: string, path: string) {
  return {
    meta: [{ title: `${title} | Shata` }, { name: 'description', content: description }, { property: 'og:title', content: `${title} | Shata` }, { property: 'og:description', content: description }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { property: 'og:url', content: `https://darb.website${path}` }],
    links: [{ rel: 'canonical', href: `https://darb.website${path}` }],
  };
}