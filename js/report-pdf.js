'use strict';
// Self-contained, paginated PDF export with a searchable text layer. Browser-rendered
// pages preserve local names without downloading fonts or sending report data elsewhere.
window.SpaReportPdf=(() => {
  const encoder=new TextEncoder();
  const width=1684,height=1190,margin=80,usable=width-margin*2;
  const ink='#29331e',muted='#6f715f',gold='#ae8c43';
  function pdfString(text){let result='FEFF';for(let i=0;i<text.length;i++)result+=text.charCodeAt(i).toString(16).padStart(4,'0');return '<'+result+'>';}
  function glyphText(text){return '<'+Array.from(text).map(c=>(c.charCodeAt(0)>=32&&c.charCodeAt(0)<=255?c.charCodeAt(0):63).toString(16).padStart(2,'0')).join('')+'>';}
  function wrap(ctx,value,maxWidth){
    const result=[];
    for(const paragraph of String(value??'').split('\n')){
      if(!paragraph){result.push('');continue;}
      let line='';
      for(const word of paragraph.split(/\s+/)){
        const next=line?line+' '+word:word;
        if(ctx.measureText(next).width<=maxWidth){line=next;continue;}
        if(line){result.push(line);line='';}
        if(ctx.measureText(word).width<=maxWidth){line=word;continue;}
        // Split long emails and references without dropping characters.
        for(const character of Array.from(word)){if(line&&ctx.measureText(line+character).width>maxWidth){result.push(line);line='';}line+=character;}
      }
      result.push(line);
    }
    return result.length?result:[''];
  }
  function jpeg(canvas){return new Promise((resolve,reject)=>canvas.toBlob(async blob=>{if(!blob){reject(new Error('The report page could not be prepared.'));return;}resolve(new Uint8Array(await blob.arrayBuffer()));},'image/jpeg',0.94));}
  async function build({title,sections,generatedAt=new Date(),onProgress=()=>{}}){
    if(!sections.length)throw new Error('Choose a report to export.');
    await document.fonts.ready;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PDF export is unavailable in this browser.');
    const pages=[];
    const stamp=new Intl.DateTimeFormat('en-ZA',{timeZone:'Africa/Johannesburg',dateStyle:'medium',timeStyle:'short'}).format(generatedAt);
    let y=0,section,columnWidths,headerHeight,textLayer=[];
    const paintText=ctx.fillText.bind(ctx);
    ctx.fillText=(text,x,y)=>{
      const value=String(text),measured=ctx.measureText(value).width;
      const left=x-(ctx.textAlign==='right'?measured:ctx.textAlign==='center'?measured/2:0);
      textLayer.push({text:value,x:left,y,size:Number(ctx.font.match(/([0-9.]+)px/)[1])});
      paintText(text,x,y);
    };
    function begin(){
      textLayer=[];
      ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
      ctx.fillStyle=gold;ctx.font='600 19px Arial, sans-serif';ctx.fillText('ADELAIDE WELLNESS & SPA',margin,66);
      ctx.fillStyle=ink;ctx.font='600 38px Georgia, serif';ctx.fillText(section.title,margin,124);
      ctx.fillStyle=muted;ctx.font='20px Arial, sans-serif';ctx.fillText(section.rows.length+' '+(section.rows.length===1?'record':'records')+' · Generated '+stamp+' · South African time',margin,163);
      ctx.strokeStyle='#d9cba7';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(margin,184);ctx.lineTo(width-margin,184);ctx.stroke();
      columnWidths=section.columns.map(c=>usable*c.width);
      ctx.font='600 20px Arial, sans-serif';
      const labels=section.columns.map((c,i)=>wrap(ctx,c.label,columnWidths[i]-24));headerHeight=Math.max(...labels.map(v=>v.length))*25+24;
      ctx.fillStyle=ink;ctx.fillRect(margin,206,usable,headerHeight);
      let x=margin;ctx.fillStyle='#fff';labels.forEach((lines,i)=>{lines.forEach((line,n)=>ctx.fillText(line,x+12,232+n*25));x+=columnWidths[i];});
      y=206+headerHeight;
    }
    async function finish(){
      ctx.strokeStyle='#ddd7c5';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(margin,height-65);ctx.lineTo(width-margin,height-65);ctx.stroke();
      ctx.fillStyle=muted;ctx.font='17px Arial, sans-serif';ctx.fillText('Adelaide Wellness & Spa · Staff report',margin,height-32);
      ctx.textAlign='right';ctx.fillText('Page '+(pages.length+1),width-margin,height-32);ctx.textAlign='left';
      pages.push({image:await jpeg(canvas),text:textLayer.slice()});onProgress(pages.length);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    for(section of sections){
      begin();
      if(!section.rows.length){ctx.fillStyle=muted;ctx.font='22px Arial, sans-serif';ctx.fillText('No records to report.',margin+12,y+48);}
      for(let rowIndex=0;rowIndex<section.rows.length;rowIndex++){
        ctx.font='20px Arial, sans-serif';
        const cells=section.rows[rowIndex].map((value,i)=>wrap(ctx,value,columnWidths[i]-24));
        const totalLines=Math.max(...cells.map(lines=>lines.length));let offset=0;
        while(offset<totalLines){
          const fitting=Math.floor((height-88-y-24)/26);
          if(fitting<1){await finish();begin();continue;}
          const lines=Math.min(fitting,totalLines-offset),rowHeight=lines*26+24;
          ctx.fillStyle=rowIndex%2===0?'#f7f6ef':'#fff';ctx.fillRect(margin,y,usable,rowHeight);
          ctx.font='20px Arial, sans-serif';ctx.fillStyle=ink;let x=margin;
          cells.forEach((cell,i)=>{let visible=cell.slice(offset,offset+lines);if(offset>0&&i===0)visible=wrap(ctx,cell[0]+' (continued)',columnWidths[i]-24).slice(0,lines);visible.forEach((line,n)=>ctx.fillText(line,x+12,y+29+n*26));x+=columnWidths[i];});
          ctx.strokeStyle='#e1ddce';ctx.beginPath();ctx.moveTo(margin,y+rowHeight);ctx.lineTo(width-margin,y+rowHeight);ctx.stroke();
          y+=rowHeight;offset+=lines;
          if(offset<totalLines){await finish();begin();}
        }
      }
      await finish();
    }
    const objects=[];
    const pageIds=pages.map((_,i)=>5+i*3);
    objects[1]=['<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /DisplayDocTitle true >> >>'];
    objects[2]=['<< /Type /Pages /Count '+pages.length+' /Kids ['+pageIds.map(id=>id+' 0 R').join(' ')+'] >>'];
    const fontId=pages.length*3+3;
    pages.forEach((page,i)=>{
      const bytes=page.image;
      const imageId=3+i*3,contentId=imageId+1,pageId=imageId+2;
      objects[imageId]=['<< /Type /XObject /Subtype /Image /Width '+width+' /Height '+height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+bytes.length+' >>\nstream\n',bytes,'\nendstream'];
      const commands='q\n842 0 0 595 0 0 cm\n/ReportPage Do\nQ\n'+page.text.map(line=>'/Span << /ActualText '+pdfString(line.text)+' >> BDC\nBT /F1 '+(line.size/2).toFixed(2)+' Tf 3 Tr 1 0 0 1 '+(line.x/2).toFixed(2)+' '+(595-line.y/2).toFixed(2)+' Tm '+glyphText(line.text)+' Tj ET\nEMC\n').join('');
      objects[contentId]=['<< /Length '+encoder.encode(commands).length+' >>\nstream\n'+commands+'endstream'];
      objects[pageId]=['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /ReportPage '+imageId+' 0 R >> /Font << /F1 '+fontId+' 0 R >> >> /Contents '+contentId+' 0 R >>'];
    });
    objects[fontId]=['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
    const infoId=fontId+1;
    objects[infoId]=['<< /Title '+pdfString('Adelaide Wellness & Spa — '+title)+' /Author '+pdfString('Adelaide Wellness & Spa')+' /Producer '+pdfString('Adelaide report exporter')+' >>'];
    const parts=[],offsets=[0];let size=0;
    function append(value){const bytes=typeof value==='string'?encoder.encode(value):value;parts.push(bytes);size+=bytes.length;}
    append('%PDF-1.7\n%\u00e2\u00e3\u00cf\u00d3\n');
    for(let id=1;id<objects.length;id++){offsets[id]=size;append(id+' 0 obj\n');objects[id].forEach(append);append('\nendobj\n');}
    const xref=size;
    append('xref\n0 '+objects.length+'\n0000000000 65535 f \n');
    for(let id=1;id<objects.length;id++)append(String(offsets[id]).padStart(10,'0')+' 00000 n \n');
    append('trailer\n<< /Size '+objects.length+' /Root 1 0 R /Info '+infoId+' 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
    return {blob:new Blob(parts,{type:'application/pdf'}),pageCount:pages.length};
  }
  async function download(options){
    const result=await build(options),url=URL.createObjectURL(result.blob),a=document.createElement('a');
    a.href=url;a.download=options.filename||'adelaide-report.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    return result;
  }
  return {build,download};
})();
