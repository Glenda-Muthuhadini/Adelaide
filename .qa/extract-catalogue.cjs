const fs=require('node:fs');
const text=s=>s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&ndash;/g,'–').replace(/\s+/g,' ').trim();
const prices=html=>[...html.matchAll(/<div class="card-price-row"><dt>([\s\S]*?)<\/dt><dd>([\s\S]*?)<\/dd><\/div>/g)].map(m=>({label:text(m[1]),display:text(m[2])}));
const services=[...fs.readFileSync('services.html','utf8').matchAll(/<article class="catalogue-card" data-category="([^"]+)">([\s\S]*?)<\/article>/g)].map(m=>({name:text(m[2].match(/<h2>([\s\S]*?)<\/h2>/)[1]),category:m[1],description:text(m[2].match(/<p>([\s\S]*?)<\/p>/)?.[1]||''),inclusions:[...m[2].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(x=>text(x[1])),image_path:m[2].match(/<img[^>]+src="([^"]+)"/)?.[1]||'',prices:prices(m[2])}));
const promotions=[...fs.readFileSync('packages.html','utf8').matchAll(/<article class="special-card special-feature"[^>]*>([\s\S]*?)<\/article>/g)].map(m=>({name:text(m[1].match(/<h3[^>]*>([\s\S]*?)<\/h3>/)[1]),inclusions:[...new Set([...m[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(x=>text(x[1])))],prices:prices(m[1]),image_path:m[1].match(/<img[^>]+src="([^"]+)"/)?.[1]||''}));
fs.writeFileSync('.qa/catalogue-source.json',JSON.stringify({services,promotions},null,2));
console.log(JSON.stringify({services:services.map(s=>({name:s.name,category:s.category,prices:s.prices})),promotions},null,2));
