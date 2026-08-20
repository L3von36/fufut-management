var e={receipt:{width:`80mm`,margin:`4mm`,base:`12px`},a4:{width:`210mm`,margin:`12mm`,base:`13px`}};function t(e){return e==null?``:String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function n(e,n){return`<div class="ln"><span>${t(e)}</span><span>${t(n)}</span></div>`}function r(e,{bold:n=!1,tag:r=`td`}={}){return`<tr${n?` style="font-weight:700"`:``}>${e.map(e=>`<${r}>${t(e)}</${r}>`).join(``)}</tr>`}function i(e,t){return`<table>
    <thead>${r(e,{bold:!0,tag:`th`})}</thead>
    <tbody>${t.map(e=>r(e)).join(``)}</tbody>
  </table>`}function a(t){let n=e[t]||e.receipt;return`
    @page { size: ${t===`a4`?`A4`:n.width+` auto`}; margin: ${n.margin}; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: ${n.base}; margin: 0; padding: 0; color: #000;
      width: ${t===`a4`?`auto`:n.width};
    }
    h1 { font-size: 1.25em; margin: 0 0 2px; text-align: center; letter-spacing: .04em; }
    .sub { text-align: center; font-size: .85em; margin-bottom: 8px; }
    .meta { font-size: .82em; margin-bottom: 8px; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .ln { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
    .ln.total { font-weight: 700; font-size: 1.1em; border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: .85em; }
    th, td { text-align: left; padding: 3px 4px; vertical-align: top; }
    thead th { border-bottom: 1px solid #000; }
    tbody tr { border-bottom: 1px solid #eee; }
    .right { text-align: right; }
    .foot { margin-top: 10px; text-align: center; font-size: .78em; }
    /* Kitchen tickets are read across a hot pass at arm's length. */
    .ticket-item { font-size: 1.15em; font-weight: 700; padding: 3px 0; }
    .ticket-mods { font-size: .85em; font-weight: 400; padding-left: 10px; }
    .badge-type { border: 2px solid #000; padding: 2px 8px; font-weight: 700; display: inline-block; }
  `}function o({title:e,body:n,paper:r=`receipt`,heading:i=`FU FUT COFFEE`,subtitle:o=``}){let s=window.open(``,`_blank`,`width=420,height=640`);if(!s)return!1;s.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${t(e)}</title><style>${a(r)}</style></head>
<body>
  ${i?`<h1>${t(i)}</h1>`:``}
  ${o?`<div class="sub">${t(o)}</div>`:``}
  ${n}
</body></html>`),s.document.close(),s.focus();let c=()=>{try{s.print(),s.close()}catch{}};return s.document.readyState===`complete`?setTimeout(c,60):s.onload=c,!0}function s(e=new Date){return e.toLocaleString()}function c(e,n=[]){let r=String(e.order_type||e.type||`dine-in`).replace(`-`,` `).toUpperCase(),i=e.tableNum||e.table_number||e.table_id,a=[`<div style="text-align:center;margin-bottom:6px"><span class="badge-type">${t(r)}</span></div>`,`<h1 style="font-size:1.6em">#${t(String(e.id||``).slice(-4))}</h1>`,i?`<div class="sub">Table ${t(i)}</div>`:``,e.customer?`<div class="sub">${t(e.customer)}</div>`:``,e.customer_phone?`<div class="sub">${t(e.customer_phone)}</div>`:``,`<hr>`,n.length?n.map(e=>{let n=e.modifiers&&e.modifiers!==`[]`?u(e.modifiers):``;return`<div class="ticket-item">${t(e.qty)} × ${t(e.name)}</div>`+(n?`<div class="ticket-mods">${t(n)}</div>`:``)+(e.notes?`<div class="ticket-mods">! ${t(e.notes)}</div>`:``)}).join(``):`<div class="ticket-item">${t(e.items||``)}</div>`,`<hr>`,e.notes?`<div class="ticket-item" style="font-size:1.2em">** ${t(e.notes)} **</div>`:``,`<div class="foot">${t(s())}</div>`].join(``);return o({title:`Kitchen ticket ${e.id}`,body:a,paper:`receipt`,subtitle:`KITCHEN`})}function l(e,r,i){let a=e.id||`—`,c=s(),l=r.map(e=>{let t=(e.selectedModifiers||[]).map(e=>e.name).join(`, `),r=[e.name];return t&&r.push(`[${t}]`),n(`${e.qty}x ${r.join(` `)}`,`ETB ${Math.round(i.lineTotal(e)*e.qty)}`)}).join(``),u=[n(`Subtotal`,`ETB ${Math.round(e.subtotal||0)}`)];e.discount>0&&u.push(n(`Discount${e.discountReason?` (`+t(e.discountReason)+`)`:``}`,`-ETB ${Math.round(e.discount)}`)),e.tip>0&&u.push(n(`Tip`,`ETB ${Math.round(e.tip)}`)),e.deliveryFee>0&&u.push(n(`Delivery Fee`,`ETB ${Math.round(e.deliveryFee)}`));let d=(e.paymentBreakdown||[]).map(e=>{let r=n(t(e.method.charAt(0).toUpperCase()+e.method.slice(1)),`ETB ${Math.round(e.amount)}`);return e.tendered!==void 0&&(r+=n(`  Tendered`,`ETB ${Math.round(e.tendered)}`),r+=n(`  Change`,`ETB ${Math.round(e.change||0)}`)),r}).join(``),f=[n(`Type`,`${t(e.type)}${e.tableNum?` · Table `+t(e.tableNum):``}`),n(`Customer`,t(e.customer)||`Walk-in`),`<hr>`,l,`<hr>`,u.join(``),`<div class="ln total"><span>GRAND TOTAL</span><span>ETB ${t(String(e.total))}</span></div>`,`<hr>`,`<div style="font-size:.82em;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;color:#666">Payment</div>`,d,`<hr>`,`<div class="foot">Thank you for visiting!<br>FU FUT COFFEE</div>`,`<div class="foot">${t(c)}</div>`].join(``);return o({title:`Receipt #${a}`,body:f,paper:`receipt`,subtitle:`FU FUT CAFÉ`})}function u(e){let t=e;if(typeof t==`string`)try{t=JSON.parse(t)}catch{return t}return Array.isArray(t)?t.map(e=>typeof e==`string`?e:e&&e.name).filter(Boolean).join(`, `):``}function d({title:e,subtitle:r=``,summary:a=[],headers:c,rows:l,footer:u=``}){return o({title:e,body:[`<div class="meta"><strong>${t(e)}</strong>${r?` — `+t(r):``}</div>`,a.length?a.map(([e,t])=>n(e,t)).join(``)+`<hr>`:``,c&&l?i(c,l):``,u?`<div class="foot">${t(u)}</div>`:``,`<div class="foot">Printed ${t(s())}</div>`].join(``),paper:`a4`,subtitle:r})}export{c as n,d as r,l as t};