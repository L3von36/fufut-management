import * as pdfjsLib from 'pdfjs-dist';

// Make sure workerSrc is set correctly for Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export async function verifyReceipt(bank, urlOrId) {
  if (bank === 'telebirr') {
    return await verifyTelebirr(urlOrId);
  } else if (bank === 'cbe') {
    return await verifyCbe(urlOrId);
  }
  throw new Error(`Unsupported bank: ${bank}`);
}

async function fetchProxiedText(url) {
  const proxyUrl = `http://localhost:8787/api/payments/proxy?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
  return await res.text();
}

async function fetchProxiedBuffer(url) {
  const proxyUrl = `http://localhost:8787/api/payments/proxy?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
  return await res.arrayBuffer();
}

async function verifyTelebirr(id) {
  const url = id.startsWith('http') ? id : `https://transactioninfo.ethiotelecom.et/receipt/${id}`;
  const html = await fetchProxiedText(url);
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  const data = {};
  
  const pick = (regex, key) => {
    // Find a text node matching the regex
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (regex.test(node.nodeValue)) {
         const tr = node.parentNode.closest('tr');
         if (tr) {
             const tds = Array.from(tr.querySelectorAll('td'));
             const idx = tds.findIndex(el => el.textContent.includes(node.nodeValue));
             if (idx >= 0 && tds[idx+1]) {
                data[key] = tds[idx+1].textContent.trim();
                return;
             }
         }
      }
    }
  };

  pick(/Payer\s*Name/i, 'payer_name');
  pick(/transaction\s*status/i, 'status');
  pick(/Total\s*Paid\s*Amount/i, 'total_paid');
  
  if (!data.status) throw new Error("Could not parse Telebirr receipt");
  
  return {
    payerName: data.payer_name,
    amount: parseFloat(data.total_paid?.replace(/[^\d.]/g, '') || '0'),
    status: data.status,
    reference: url,
    date: new Date().toISOString()
  };
}

async function verifyCbe(ftAndAccount) {
  let url = ftAndAccount;
  if (!url.startsWith('http')) {
     const parts = ftAndAccount.split('-');
     if (parts.length < 2) throw new Error("For CBE, provide FT number and last 8 digits of account separated by hyphen (e.g. FT123-12345678) or full URL");
     url = `https://apps.cbe.com.et:100/?id=${parts[0].trim().toUpperCase()}${parts[1].trim()}`;
  }
  
  const buffer = await fetchProxiedBuffer(url);
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }
  
  const amtMatch = fullText.match(/Transferred Amount\s+([\d,.]+)\s*ETB/i);
  const dateMatch = fullText.match(/Payment Date & Time\s*([\d/:,\sAPMapm]+)/i);
  const amountStr = amtMatch ? amtMatch[1] : '0';
  
  return {
    payerName: fullText.match(/Payer\s+([A-Z\s]+)/i)?.[1]?.trim(),
    amount: parseFloat(amountStr.replace(/,/g, '')),
    status: 'SUCCESS',
    reference: url,
    date: dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString()
  };
}
