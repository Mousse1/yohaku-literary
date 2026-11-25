export function servePythonRunner(request){
 if(new URL(request.url).pathname!=='/python-runner')return null;
 const allowed=['GET','HEAD'].includes(request.method);
 return new Response(request.method==='HEAD'?null:allowed?'<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><script src="/python-frame.js" defer></script></head><body>Python runner</body></html>':'Method not allowed',{
  status:allowed?200:405,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff',
   'content-security-policy':"sandbox allow-scripts; default-src 'none'; script-src 'self' https://cdn.jsdelivr.net/pyodide/v314.0.8/full/ 'wasm-unsafe-eval'; connect-src https://cdn.jsdelivr.net/pyodide/v314.0.8/full/; worker-src blob:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"
  }
 });
}
