// Search Console's verification token is public metadata, not a credential.
export function searchVerificationPlugin(token='') {
  const value=String(token).trim()
  return {name:'yohaku-search-verification',transformIndexHtml(){
    return value?[{tag:'meta',attrs:{name:'google-site-verification',content:value},injectTo:'head'}]:[]
  }}
}
