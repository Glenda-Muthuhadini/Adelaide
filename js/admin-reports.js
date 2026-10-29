'use strict';
window.SpaReports={
  create({getData,refresh,table}){
    const esc=Spa.escape;
    const names={appointments:'Appointments',clients:'Clients',services:'Services',addons:'Add-ons',promotions:'Specials & Promotions',staff:'Staff'};
    const categories={massages:'Massage therapies',facials:'Facial treatments',other:'Other treatments',addons:'Add-on therapies',packages:'Packages'};
    const states={pending:'Pending',confirmed:'Confirmed',completed:'Completed',cancelled:'Cancelled',rejected:'Rejected',expired:'Expired'};
    const sources={online:'Website',telephone:'Telephone',whatsapp:'WhatsApp',walkin:'Walk-in'};
    const units={flat:'',per_person:' per person',per_couple:' per couple',per_group:' per group'};
    let selected='appointments',exporting=false;
    const column=(label,width)=>({label,width});
    const rateText=pricing=>(pricing||[]).map(p=>p.label+': '+(p.kind==='discount'?p.discount_percent+'% discount':Spa.money(p.price_cents))+(units[p.unit]||'')).join('\n');
    const schedule=sessions=>(sessions||[]).map(s=>Spa.date(s.starts_at)+' '+Spa.time(s.starts_at)+'–'+Spa.time(s.ends_at)+' · '+s.people+' people').join('\n')||'Not scheduled';
    function sections(data){
      const customers=new Map();
      for(const b of data.bookings){
        const key=String(b.email||'').trim().toLowerCase()+'|'+String(b.phone||'').replace(/\D/g,'');
        const last=(b.sessions||[]).map(s=>s.starts_at).sort().at(-1)||'';
        const row=customers.get(key)||{name:b.customer_name,phone:b.phone,email:b.email,count:0,last:''};
        row.count++;if(last>row.last)row.last=last;customers.set(key,row);
      }
      return {
        appointments:{title:names.appointments,columns:[column('Reference',.115),column('Client',.125),column('Service',.13),column('Sessions (SA time)',.24),column('Duration',.07),column('People',.065),column('Total',.10),column('Status',.09),column('Source',.065)],rows:data.bookings.map(b=>[b.reference,b.customer_name,b.service_name,schedule(b.sessions),b.duration+' min',String(b.people),Spa.money(b.total_cents),states[b.status]||b.status,sources[b.source]||b.source])},
        clients:{title:names.clients,columns:[column('Client',.22),column('Phone',.2),column('Email',.28),column('Appointments',.12),column('Latest appointment',.18)],rows:[...customers.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>[c.name,c.phone,c.email,String(c.count),c.last?Spa.date(c.last)+' '+Spa.time(c.last):'Not scheduled'])},
        services:{title:names.services,columns:[column('Service',.2),column('Category',.14),column('Description / includes',.2),column('Duration & prices',.25),column('Preparation',.1),column('Status',.11)],rows:data.services.map(s=>{
          const prices=data.options.filter(o=>o.service_id===s.id&&o.active).sort((a,b)=>a.duration-b.duration).map(o=>o.duration+' min: '+Spa.money(o.price_cents)+(o.price_people===2?' per couple':' per person'));
          if(s.base_price_cents!=null)prices.unshift('Advertised: '+Spa.money(s.base_price_cents));
          return [s.name,categories[s.category]||'Other',[s.description,...(s.inclusions||[])].filter(Boolean).join('\n'),prices.join('\n')||'Not set',s.preparation_minutes==null?'Spa default':s.preparation_minutes+' min',s.active?'Active':'Inactive'];
        })},
        addons:{title:names.addons,columns:[column('Add-on',.18),column('Description',.17),column('Price options',.22),column('Applies to',.32),column('Status',.11)],rows:(data.addons||[]).map(a=>{
          const links=[...(a.service_ids||[]).map(id=>data.services.find(s=>s.id===id)?.name),...(a.promotion_ids||[]).map(id=>(data.promotions||[]).find(p=>p.id===id)?.name)].filter(Boolean);if(a.standalone)links.unshift('Standalone treatment');
          return [a.name,a.description||'',a.pricing?.length?rateText(a.pricing):Spa.money(a.price_cents),links.join('\n')||'Not assigned',a.active?'Active':'Inactive'];
        })},
        promotions:{title:names.promotions,columns:[column('Special / promotion',.17),column('Description',.16),column('Prices & discounts',.24),column('Includes',.25),column('Dates',.1),column('Status',.08)],rows:(data.promotions||[]).map(p=>[p.name,p.description||'',rateText(p.pricing),(p.inclusions||[]).join('\n'),(p.starts_on||'No start date')+'\n'+(p.ends_on||'No end date'),p.active?'Active':'Inactive'])},
        staff:{title:names.staff,columns:[column('Name',.25),column('Email',.4),column('Role',.2),column('Status',.15)],rows:(data.staff||[]).map(s=>[s.name,s.email,s.role==='owner'?'Owner':'Staff',s.active?'Active':'Inactive'])}
      };
    }
    function render(){
      const all=sections(getData()),report=all[selected];
      return '<section class="reports-module"><div class="module-toolbar"><div><h2>Reports</h2><p class="report-intro">Download one report or combine all six into a single PDF. Reports include all records.</p></div><button class="button button-dark" type="button" data-download-all-reports '+(exporting?'disabled':'')+'>Download all reports (PDF)</button></div><div class="report-cards">'+Object.entries(names).map(([key,name])=>'<article class="report-card '+(key===selected?'is-selected':'')+'"><div><h3>'+name+'</h3><p>'+all[key].rows.length+' '+(all[key].rows.length===1?'record':'records')+'</p></div><div class="report-card-actions"><button type="button" data-report-view="'+key+'" aria-pressed="'+(key===selected)+'">View report</button><button type="button" data-download-report="'+key+'" '+(exporting?'disabled':'')+' aria-label="Download '+name+' as PDF">Download PDF</button></div></article>').join('')+'</div><p id="report-export-status" role="status" aria-live="polite"></p><div class="report-preview"><div class="module-toolbar"><h3>'+report.title+'</h3><button type="button" class="button button-outline" data-download-report="'+selected+'" '+(exporting?'disabled':'')+'>Download PDF</button></div>'+(report.rows.length?table(report.columns.map(c=>c.label),report.rows.map(row=>row.map(cell=>esc(cell).replace(/\n/g,'<br>')))):'<p class="empty-state">No '+report.title.toLowerCase()+' to report yet.</p>')+'</div></section>';
    }
    function setStatus(text){const status=document.querySelector('#report-export-status');if(status)status.textContent=text;}
    document.addEventListener('click',async event=>{
      const button=event.target.closest('[data-report-view],[data-download-report],[data-download-all-reports]');if(!button)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(button.dataset.reportView){selected=button.dataset.reportView;document.querySelector('#module-view').innerHTML=render();document.querySelector('[data-report-view="'+selected+'"]').focus({preventScroll:true});return;}
      if(exporting||!getData())return;
      exporting=true;
      document.querySelectorAll('[data-download-report],[data-download-all-reports]').forEach(el=>el.disabled=true);
      setStatus('Checking staff access and preparing your PDF…');
      try{
        // Revalidate the session and staff permission before preparing private exports.
        await refresh();
        setStatus('Preparing your PDF…');
        const all=sections(getData()),combined=button.hasAttribute('data-download-all-reports'),key=button.dataset.downloadReport;
        const title=combined?'All reports':names[key];
        const result=await SpaReportPdf.download({title,sections:combined?Object.values(all):[all[key]],filename:'adelaide-'+(combined?'all-reports':key)+'-'+Spa.date(Date.now())+'.pdf',onProgress:pages=>setStatus('Preparing your PDF · '+pages+' '+(pages===1?'page':'pages'))});
        setStatus(title+' PDF ready · '+result.pageCount+' '+(result.pageCount===1?'page':'pages')+'. Download started.');
      }catch(error){setStatus(error.message);}
      finally{exporting=false;document.querySelectorAll('[data-download-report],[data-download-all-reports]').forEach(el=>el.disabled=false);}
    });
    return {render,sections};
  }
};
