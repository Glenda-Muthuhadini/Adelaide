'use strict';
window.SpaCatalogue = {
  create({getData,refresh,toast,table}) {
    const esc=Spa.escape;
    const labels={service:'service',addon:'add-on',promotion:'special or promotion',staff:'staff member'};
    const titles={Services:'Services','Add-ons':'Add-ons','Specials & Promotions':'Specials & Promotions',Staff:'Staff'};
    const categories={massages:'Massage therapies',facials:'Facial treatments',other:'Other treatments',addons:'Add-on massage therapies',packages:'Packages'};
    const units={flat:'As listed',per_person:'Per person',per_couple:'Per couple',per_group:'Per group'};
    const collections={service:'services',addon:'addons',promotion:'promotions'};
    const modal=document.createElement('dialog');
    modal.id='catalogue-dialog';modal.className='catalogue-dialog';modal.setAttribute('aria-labelledby','catalogue-dialog-title');document.body.append(modal);
    let busy=false;
    const item=(kind,id)=>(getData()?.[collections[kind]]||[]).find(row=>row.id===id);
    const values=(options,selected)=>Object.entries(options).map(([value,label])=>'<option value="'+value+'" '+(String(selected)===value?'selected':'')+'>'+esc(label)+'</option>').join('');
    const actions=(kind,row)=>'<div class="catalogue-row-actions"><button type="button" data-catalogue-edit="'+kind+'" data-item-id="'+row.id+'" aria-label="Edit '+esc(row.name)+'">Edit</button><button type="button" data-catalogue-delete="'+kind+'" data-item-id="'+row.id+'" aria-label="Delete '+esc(row.name)+'">Delete</button></div>';
    const priceList=pricing=>'<ul class="catalogue-prices">'+pricing.map(p=>'<li>'+esc(p.label)+': <strong>'+(p.kind==='discount'?esc(p.discount_percent)+'% discount':Spa.money(p.price_cents))+'</strong>'+(p.unit&&p.unit!=='flat'?' <small>'+esc(units[p.unit]||'')+'</small>':'')+'</li>').join('')+'</ul>';
    const status=active=>'<span class="status status-'+(active?'confirmed':'cancelled')+'">'+(active?'Active':'Inactive')+'</span>';
    function render(section) {
      if(!Object.hasOwn(titles,section))return null;
      const d=getData();let body='',kind;
      if(section==='Services'){
        kind='service';body=table(['Service','Category','Duration & price','Status','Actions'],d.services.map(s=>{
          const rates=d.options.filter(o=>o.service_id===s.id&&o.active).sort((a,b)=>a.duration-b.duration).map(o=>({label:o.duration+' minutes',kind:'fixed',price_cents:o.price_cents,unit:o.price_people===2?'per_couple':'per_person'}));
          if(s.base_price_cents!=null)rates.unshift({label:'Advertised price',kind:'fixed',price_cents:s.base_price_cents,unit:'flat'});
          return ['<strong>'+esc(s.name)+'</strong>'+(s.description?'<small class="catalogue-description">'+esc(s.description)+'</small>':''),esc(categories[s.category]||'Other treatments'),rates.length?priceList(rates):'Price to be set',status(s.active),actions(kind,s)];
        }));
      }else if(section==='Add-ons'){
        kind='addon';body=table(['Add-on','Price options','Applies to','Status','Actions'],(d.addons||[]).map(a=>{
          const links=[...(a.service_ids||[]).map(id=>d.services.find(s=>s.id===id)?.name),...(a.promotion_ids||[]).map(id=>(d.promotions||[]).find(p=>p.id===id)?.name)].filter(Boolean);
          if(a.standalone)links.unshift('Standalone treatment');
          return [esc(a.name),priceList(a.pricing?.length?a.pricing:[{label:'Price',kind:'fixed',price_cents:a.price_cents,unit:'flat'}]),links.map(esc).join('<br>')||'Not assigned',status(a.active),actions(kind,a)];
        }));
      }else if(section==='Specials & Promotions'){
        kind='promotion';body=table(['Special / promotion','Prices & discounts','Includes','Dates','Status','Actions'],(d.promotions||[]).map(p=>[esc(p.name),priceList(p.pricing||[]),'<ul class="catalogue-prices">'+(p.inclusions||[]).map(text=>'<li>'+esc(text)+'</li>').join('')+'</ul>',esc(p.starts_on||'No start date')+'<br>'+esc(p.ends_on||'No end date'),status(p.active),actions(kind,p)]));
      }else {
        if(d.viewer_role==='owner')kind='staff';
        body=table(['Name','Email','Role','Status'],(d.staff||[]).map(s=>[esc(s.name),esc(s.email),s.role==='owner'?'Owner':'Staff',status(s.active)]));
      }
      return '<div class="module-toolbar"><h2>'+titles[section]+'</h2>'+(kind?'<button class="button button-dark" type="button" data-catalogue-add="'+kind+'">'+({service:'Add service',addon:'Add add-on',promotion:'Add special / promotion',staff:'Add staff'}[kind])+'</button>':'')+'</div>'+body;
    }
    function common(row={}) {
      return '<input type="hidden" name="item_id" value="'+esc(row.id||'')+'"><label>Name<input name="name" required maxlength="120" value="'+esc(row.name||'')+'"></label><label>Status<select name="active">'+values({true:'Active',false:'Inactive'},row.active!==false)+'</select></label><label class="wide">Description <small>Optional</small><textarea name="description" maxlength="2000">'+esc(row.description||'')+'</textarea></label>';
    }
    function marketingFields(row={}) {
      return '<label class="wide">What’s included <small>One item per line, optional</small><textarea name="inclusions" maxlength="4000">'+esc((row.inclusions||[]).join('\n'))+'</textarea></label><label class="wide">Photo path or URL <small>Optional</small><input name="image_path" maxlength="500" placeholder="assets/images/… or https://…" value="'+esc(row.image_path||'')+'"></label>';
    }
    function serviceForm(row={}) {
      const d=getData();
      return common(row)+'<label>Category<select name="category">'+values(categories,row.category||'other')+'</select></label><label>Advertised price (R) <small>Optional when duration prices are provided</small><input name="base_price" type="number" min="0" max="100000" step="0.01" value="'+(row.base_price_cents==null?'':(row.base_price_cents/100).toFixed(2))+'"></label>'+marketingFields(row)+'<fieldset class="wide catalogue-fieldset"><legend>Duration and price options</legend><p>Choose supported durations and set a price for each. Leave durations unchecked if the full treatment time still needs to be established.</p>'+[30,60,90].map(duration=>{
        const option=d.options.find(o=>o.service_id===row.id&&o.duration===duration&&o.active);
        return '<div class="catalogue-duration" data-duration-row="'+duration+'"><label class="catalogue-check"><input type="checkbox" name="duration_'+duration+'" data-duration-toggle="'+duration+'" '+(option?'checked':'')+'>'+duration+' minutes</label><label>Price (R)<input name="price_'+duration+'" type="number" min="0" max="100000" step="0.01" required value="'+(option?(option.price_cents/100).toFixed(2):'')+'" '+(option?'':'disabled')+'></label><label>Price covers<select name="people_'+duration+'" '+(option?'':'disabled')+'>'+values({1:'One person',2:'Two people'},option?.price_people||1)+'</select></label></div>';
      }).join('')+'</fieldset><label>Preparation time<select name="preparation_minutes"><option value="">Use spa default</option>'+[0,30,60,90,120].map(n=>'<option value="'+n+'" '+(row.preparation_minutes===n?'selected':'')+'>'+n+' minutes</option>').join('')+'</select></label>';
    }
    function rateRow(row={},discounts=false) {
      const booking=discounts?'<label>Bookable treatment &amp; duration<select data-rate="option_id"><option value="">Not configured for online booking</option>'+getData().options.filter(o=>o.active&&getData().services.find(s=>s.id===o.service_id)?.active).map(o=>'<option value="'+o.id+'" '+(row.option_id===o.id?'selected':'')+'>'+esc(getData().services.find(s=>s.id===o.service_id).name)+' · '+o.duration+' minutes</option>').join('')+'</select></label><label>People covered <small>For group or package prices</small><input data-rate="group_people" type="number" min="1" max="192" value="'+(row.group_people||'')+'"></label><label class="catalogue-check"><input type="checkbox" data-rate="group_bundle" '+(row.group_bundle?'checked':'')+'>Combine group price tiers for larger parties</label>':'';
      return '<div class="catalogue-rate"><label>Option label<input data-rate="label" maxlength="120" required placeholder="e.g. 60 minutes or 2 people" value="'+esc(row.label||'')+'"></label><label>Type<select data-rate="kind">'+values(discounts?{fixed:'Price (R)',discount:'Discount (%)'}:{fixed:'Price (R)'},row.kind||'fixed')+'</select></label><label>Amount<input data-rate="amount" type="number" min="0" max="'+(row.kind==='discount'?100:100000)+'" step="0.01" required value="'+(row.kind==='discount'?(row.discount_percent??''):(row.price_cents==null?'':(row.price_cents/100).toFixed(2)))+'"></label><label>Price basis<select data-rate="unit">'+values(units,row.unit||'flat')+'</select></label>'+booking+'<button type="button" data-remove-rate aria-label="Remove pricing option">Remove</button></div>';
    }
    function pricingFields(rows,discounts=false) {
      return '<fieldset class="wide catalogue-fieldset"><legend>Prices'+(discounts?' and discounts':'')+'</legend><div data-rate-list>'+rows.map(row=>rateRow(row,discounts)).join('')+'</div><button type="button" data-add-rate="'+(discounts?'discounts':'prices')+'">Add pricing option</button></fieldset>';
    }
    function checks(rows,selected,name) {
      return rows.map(row=>'<label class="catalogue-check"><input type="checkbox" name="'+name+'" value="'+row.id+'" '+(selected.includes(row.id)?'checked':'')+'>'+esc(row.name)+'</label>').join('');
    }
    function addonForm(row={}) {
      const d=getData(),prices=row.pricing?.length?row.pricing:[{label:'Price',kind:'fixed',price_cents:row.price_cents,unit:'flat'}];
      return common(row)+pricingFields(prices)+'<label class="wide catalogue-check"><input type="checkbox" name="standalone" '+(row.standalone?'checked':'')+'>Available as a standalone treatment</label><fieldset class="wide catalogue-fieldset"><legend>Applies to services</legend><div class="addon-service-options">'+checks(d.services,row.service_ids||[],'service_ids')+'</div></fieldset><fieldset class="wide catalogue-fieldset"><legend>Applies to specials / promotions</legend><div class="addon-service-options">'+checks(d.promotions||[],row.promotion_ids||[],'promotion_ids')+'</div></fieldset>';
    }
    function promotionForm(row={}) {
      return common(row)+marketingFields(row)+pricingFields(row.pricing?.length?row.pricing:[{label:'Price',kind:'fixed',unit:'flat'}],true)+'<label>Start date <small>Optional</small><input name="starts_on" type="date" value="'+esc(row.starts_on||'')+'"></label><label>End date <small>Optional</small><input name="ends_on" type="date" value="'+esc(row.ends_on||'')+'"></label>';
    }
    function staffForm() {
      return '<label>Staff member’s name<input name="name" required maxlength="100" autocomplete="name"></label><label>Email address<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label>Initial password<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><label>Confirm initial password<input name="confirmation" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><p class="wide">New staff can sign in immediately without email confirmation. Share their initial password securely. If this email already has an account, its current password is kept.</p>';
    }
    function open(kind,id) {
      if(kind==='staff'&&getData()?.viewer_role!=='owner')throw new Error('Only the owner can add staff.');
      const row=id?item(kind,id):{};if(!row)return;
      modal.innerHTML='<div class="dialog-heading"><h2 id="catalogue-dialog-title">'+(id?'Edit ':'Add ')+labels[kind]+'</h2><button type="button" data-close-catalogue aria-label="Close form">×</button></div><form class="live-form" data-catalogue-form="'+kind+'">'+(kind==='service'?serviceForm(row):kind==='addon'?addonForm(row):kind==='staff'?staffForm():promotionForm(row))+'<p class="live-error wide catalogue-error" role="alert"></p><div class="live-actions wide"><button class="button button-dark" type="submit">Save '+labels[kind]+'</button><button type="button" data-close-catalogue>Cancel</button></div></form>';
      modal.showModal();
    }
    function confirmDelete(kind,id) {
      const row=item(kind,id);if(!row)return;
      modal.innerHTML='<div class="dialog-heading"><h2 id="catalogue-dialog-title">Delete '+labels[kind]+'?</h2><button type="button" data-close-catalogue aria-label="Close">×</button></div><p>Remove <strong>'+esc(row.name)+'</strong> from the catalogue?</p>'+(kind==='service'?'<p>Existing appointment history is kept.</p>':'')+'<p class="live-error catalogue-error" role="alert"></p><div class="live-actions"><button class="button button-dark" type="button" data-confirm-catalogue-delete="'+kind+'" data-item-id="'+id+'">Delete '+labels[kind]+'</button><button type="button" data-close-catalogue>Cancel</button></div>';
      modal.showModal();
    }
    function readPrices(form) {
      const rows=[...form.querySelectorAll('.catalogue-rate')].map(row=>{
        const read=key=>row.querySelector('[data-rate='+key+']').value;
        const rate={label:read('label').trim(),kind:read('kind'),unit:read('unit')};
        if(row.querySelector('[data-rate=option_id]'))Object.assign(rate,{option_id:read('option_id')||null,group_people:read('group_people')?Number(read('group_people')):null,group_bundle:row.querySelector('[data-rate=group_bundle]').checked});
        if(rate.kind==='discount')rate.discount_percent=Number(read('amount'));else rate.price_cents=Math.round(Number(read('amount'))*100);
        return rate;
      });
      if(!rows.length)throw new Error('Add at least one pricing option.');return rows;
    }
    function payload(form) {
      const fields=new FormData(form),get=key=>String(fields.get(key)??'');
      if(form.dataset.catalogueForm==='staff'){
        if(getData()?.viewer_role!=='owner')throw new Error('Only the owner can add staff.');
        if(get('password')!==get('confirmation'))throw new Error('The passwords do not match.');
        return {name:get('name').trim(),email:get('email').trim().toLowerCase(),password:get('password')};
      }
      const row={id:get('item_id'),name:get('name').trim(),description:get('description').trim(),active:get('active')==='true'};
      const kind=form.dataset.catalogueForm;
      if(kind==='service'){
        Object.assign(row,{category:get('category'),base_price_cents:get('base_price')===''?null:Math.round(Number(get('base_price'))*100),preparation_minutes:get('preparation_minutes'),options:[30,60,90].filter(n=>fields.has('duration_'+n)).map(n=>({duration:n,price_cents:Math.round(Number(get('price_'+n))*100),price_people:Number(get('people_'+n))}))});
      }else if(kind==='addon'){
        const pricing=readPrices(form);
        Object.assign(row,{pricing,price_cents:Math.min(...pricing.map(p=>p.price_cents)),service_ids:fields.getAll('service_ids'),promotion_ids:fields.getAll('promotion_ids'),standalone:fields.has('standalone')});
        if(!row.standalone&&!row.service_ids.length&&!row.promotion_ids.length)throw new Error('Select at least one service or promotion, or enable standalone treatment.');
        if(row.description.length>1000)throw new Error('Keep the add-on description within 1,000 characters.');
      }else Object.assign(row,{pricing:readPrices(form),starts_on:get('starts_on'),ends_on:get('ends_on')});
      if(kind!=='addon')Object.assign(row,{inclusions:get('inclusions').split('\n').map(s=>s.trim()).filter(Boolean),image_path:get('image_path').trim()});
      if(kind==='promotion'&&row.starts_on&&row.ends_on&&row.ends_on<row.starts_on)throw new Error('The end date must be on or after the start date.');
      return row;
    }
    function showError(error) { const el=modal.querySelector('.catalogue-error');if(el)el.textContent=error.message;toast(error.message); }
    function lock(value) {busy=value;modal.querySelectorAll('button,input,select,textarea').forEach(el=>{if(value){el.dataset.wasDisabled=String(el.disabled);el.disabled=true;}else{el.disabled=el.dataset.wasDisabled==='true';delete el.dataset.wasDisabled;}});}
    document.addEventListener('click',async event=>{
      const button=event.target.closest('button');if(!button)return;
      const relevant=button.matches('[data-catalogue-add],[data-catalogue-edit],[data-catalogue-delete],[data-close-catalogue],[data-confirm-catalogue-delete],[data-add-rate],[data-remove-rate]');
      if(!relevant)return;event.preventDefault();event.stopImmediatePropagation();if(busy)return;
      try{
        if(button.dataset.catalogueAdd)open(button.dataset.catalogueAdd);
        else if(button.dataset.catalogueEdit)open(button.dataset.catalogueEdit,button.dataset.itemId);
        else if(button.dataset.catalogueDelete)confirmDelete(button.dataset.catalogueDelete,button.dataset.itemId);
        else if(button.hasAttribute('data-close-catalogue'))modal.close();
        else if(button.dataset.addRate){const list=modal.querySelector('[data-rate-list]');if(list.children.length>=30)throw new Error('Use at most 30 pricing options.');list.insertAdjacentHTML('beforeend',rateRow({},button.dataset.addRate==='discounts'));}
        else if(button.hasAttribute('data-remove-rate'))button.closest('.catalogue-rate').remove();
        else if(button.dataset.confirmCatalogueDelete){
          lock(true);await Spa.rpc('spa_admin_delete_catalogue',{p_kind:button.dataset.confirmCatalogueDelete,p_id:button.dataset.itemId},true);await refresh();modal.close();toast('Deleted from the catalogue.');
        }
      }catch(error){showError(error);}finally{if(busy)lock(false);}
    });
    document.addEventListener('change',event=>{
      const input=event.target;
      if(input.dataset.durationToggle)modal.querySelectorAll('[data-duration-row="'+input.dataset.durationToggle+'"] input[type=number],[data-duration-row="'+input.dataset.durationToggle+'"] select').forEach(el=>el.disabled=!input.checked);
      if(input.dataset.rate==='kind'){const amount=input.closest('.catalogue-rate').querySelector('[data-rate=amount]');amount.max=input.value==='discount'?'100':'100000';}
    });
    document.addEventListener('submit',async event=>{
      const form=event.target;if(!form.matches('[data-catalogue-form]'))return;
      event.preventDefault();event.stopImmediatePropagation();if(busy||!form.reportValidity())return;
      try{
        const row=payload(form),kind=form.dataset.catalogueForm;
        lock(true);
        const result=kind==='staff'?await Spa.addStaff(row):await Spa.rpc('spa_admin_save_'+kind,{p_data:row},true);
        if(kind==='staff')form.reset();
        await refresh();modal.close();
        toast(kind==='staff'?(result.existing_account?'Staff access added. The existing password is unchanged.':'Staff account added. No email confirmation is required.'):'Saved successfully.');
      }catch(error){showError(error);}finally{if(busy)lock(false);}
    });
    modal.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    return {render};
  }
};
