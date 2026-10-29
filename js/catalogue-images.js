'use strict';
(async()=>{
  const cards=[...document.querySelectorAll('.treatment-card,.catalogue-card,.special-card')];
  if(!cards.length)return;
  const normalise=value=>String(value||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const aliases={facials:'signaturefacial',reflexology:'reflexologymassage'};
  try{
    const catalogue=await Spa.rpc('spa_customer_catalogue');
    for(const card of cards){
      const link=card.querySelector('a[href*="booking.html"]'),image=card.querySelector('img');if(!link||!image)continue;
      const query=new URL(link.href,location.href).searchParams,isOffer=query.has('offer');
      const name=normalise(query.get(isOffer?'offer':'service')||card.querySelector('h2,h3')?.textContent);
      const row=(isOffer?catalogue.promotions:catalogue.services).find(row=>normalise(row.name)===(aliases[name]||name));
      if(!row)continue;
      if(!row.image_path){image.hidden=true;continue;}
      if(!row.image_path.startsWith('assets/')&&!row.image_path.startsWith('https://'))continue;
      const source=new URL(row.image_path,location.href).href;if(image.src===source)continue;
      const replacement=new Image();replacement.onload=()=>{image.src=source;image.hidden=false;};replacement.src=source;
    }
  }catch{/* Keep the existing website photos available if the catalogue cannot load. */}
})();
