import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock pdfjs-dist because it relies on DOMMatrix/Canvas which Happy-DOM doesn't fully implement
vi.mock('pdfjs-dist', () => ({
  version: 'mock',
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn()
}))

import { verifyReceipt } from '../../src/lib/receiptVerifier'

// Mock global fetch to intercept the proxy calls
global.fetch = vi.fn()

describe('receiptVerifier', () => {
  beforeEach(() => {
    global.fetch.mockReset()
  })

  it('extracts data from a Telebirr HTML receipt', async () => {
    const mockHtml = `
      <html>
        <body>
          <table>
            <tr>
              <td>Payer Name</td>
              <td>Abebe Kebede</td>
            </tr>
            <tr>
              <td>Total Paid Amount</td>
              <td>1,250.50 ETB</td>
            </tr>
            <tr>
              <td>Transaction Status</td>
              <td>Success</td>
            </tr>
          </table>
        </body>
      </html>
    `
    
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => mockHtml
    })

    const result = await verifyReceipt('telebirr', 'CHQ0FJ403O')
    
    expect(result.payerName).toBe('Abebe Kebede')
    expect(result.amount).toBe(1250.5)
    expect(result.status).toBe('Success')
    expect(result.reference).toBe('https://transactioninfo.ethiotelecom.et/receipt/CHQ0FJ403O')
  })
})
