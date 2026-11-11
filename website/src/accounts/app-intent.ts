type AppIntentDefinition={id:string;kinds:readonly string[];navigation:readonly {section:string}[]};

/** Navigation intent only: installation, membership, kind and service access
 * are still resolved by the destination. Never accept an arbitrary return URL. */
export function requestedAppIntent(search:string,apps:readonly AppIntentDefinition[]){
 const params=new URLSearchParams(search),app=apps.find(a=>a.id===params.get('app'));if(!app)return null;
 const section=app.navigation.find(n=>n.section===params.get('section'))?.section||app.navigation[0]?.section||'dashboard';
 return {app:app.id,section,kinds:app.kinds};
}
export function appIntentQuery(search:string,apps:readonly AppIntentDefinition[]){const intent=requestedAppIntent(search,apps);return intent?new URLSearchParams({app:intent.app,section:intent.section}):new URLSearchParams();}
export function appIntentDestination(destination:string,search:string,apps:readonly AppIntentDefinition[]){
 const intent=requestedAppIntent(search,apps);if(!intent||!/^\/app\/(?:business\/[a-f0-9-]+|personal|developer|workspaces)(?:[?#]|$)/.test(destination)||/[\\\u0000-\u001f]/.test(destination))return destination;
 const target=new URL(destination,'https://africore.invalid'),kind=target.pathname.split('/')[2];if(kind!=='workspaces'&&!intent.kinds.includes(kind as 'business'|'personal'|'developer'))return destination;
 target.searchParams.set('app',intent.app);target.searchParams.set('section',intent.section);if(kind!=='workspaces')target.hash='Apps';
 return target.pathname+target.search+target.hash;
}
