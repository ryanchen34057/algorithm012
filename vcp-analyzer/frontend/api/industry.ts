// Vercel Serverless Function: Fetch industry & business description for all stocks
export const config = { regions: ['hkg1'] };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface CompanyInfo {
  industry: string;
  concept: string;
}

// Well-known concept tags for popular stocks
const CONCEPT_TAGS: Record<string, string> = {
  '2330': '晶圓代工', '2454': 'MediaTek', '3443': 'IC 設計', '2379': 'IC 設計',
  '3034': 'AI 伺服器', '2382': 'AI 伺服器', '3017': 'AI 伺服器', '6669': 'AI 伺服器',
  '2345': 'AI 伺服器', '3005': 'AI 伺服器', '2324': 'PCB/IC載板',
  '5274': '矽智財', '3661': '矽智財', '6547': 'ASIC',
  '2303': 'DRAM', '6510': '記憶體 IC',
  '2317': '代工/雲端', '4938': 'iPhone 組裝', '2354': '鴻海集團',
  '3037': 'AI 散熱', '3653': 'AI 散熱', '6285': 'AI 散熱',
  '3231': 'AI 機殼', '2441': 'AI 機殼',
  '4915': '高階 PCB', '3189': 'HDI PCB', '8046': '軟板 PCB',
  '2327': '網通設備', '4904': '光通訊', '2455': '光通訊', '6285': 'AI 散熱',
  '6488': '低軌衛星', '3376': '低軌衛星', '6231': '低軌衛星',
  '3481': '面板', '6116': 'Mini LED', '6176': 'LED 驅動',
  '2207': '汽車零件', '2227': '輪胎', '6271': '車用面板',
  '2891': '金控', '2881': '金控', '2882': '金控', '2886': '金控',
  '2883': '金控', '2884': '金控', '2885': '金控', '2887': '金控',
  '2890': '金控', '2892': '金控', '5880': '金控',
  '2801': '銀行', '2809': '壽險', '2812': '壽險',
  '2002': '鋼鐵', '2006': '鋼鐵', '2014': '鋼鐵',
  '1301': '塑化', '1303': '塑化', '1326': '塑化', '6505': '塑化',
  '1101': '水泥', '1102': '水泥',
  '1216': '食品', '1227': '食品', '2912': '食品通路',
  '2603': '貨櫃航運', '2609': '貨櫃航運', '2615': '貨櫃航運',
  '2605': '散裝航運', '2634': '航空',
  '4743': '新藥', '6446': 'CDMO', '4142': '基因檢測',
  '6533': '風電', '6244': '太陽能', '6409': '儲能',
  '2634': '航空', '2208': '國防航太',
  '2049': '機器人', '4506': '減速機', '2308': '工業自動化',
  '3665': '連接器', '6285': 'AI 散熱', '3045': '網通設備',
  '2467': 'PCB/IC載板', '6085': 'AI 伺服器',
  '2383': 'AI 伺服器', '3044': '網通設備', '2353': 'AI 伺服器',
  '3706': 'AI 伺服器', '3380': 'AI 散熱', '6414': 'AI 散熱',
  '2395': 'PCB/IC載板', '8299': 'PCB',
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // cache 1 day - industry rarely changes
  if (req.method === 'OPTIONS') return res.status(204).end();

  const result: Record<string, CompanyInfo> = {};

  try {
    // Fetch TWSE company basic info
    const [twse, tpex] = await Promise.allSettled([
      fetchTWSEIndustry(),
      fetchTPExIndustry(),
    ]);

    if (twse.status === 'fulfilled') Object.assign(result, twse.value);
    if (tpex.status === 'fulfilled') Object.assign(result, tpex.value);

    // Overlay concept tags
    for (const [code, concept] of Object.entries(CONCEPT_TAGS)) {
      const twKey = code + '.TW';
      const twoKey = code + '.TWO';
      if (result[twKey]) result[twKey].concept = concept;
      if (result[twoKey]) result[twoKey].concept = concept;
      // If not found in either, still add with concept only
      if (!result[twKey] && !result[twoKey]) {
        result[twKey] = { industry: '', concept };
      }
    }

    res.json({ data: result, count: Object.keys(result).length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}

async function fetchTWSEIndustry(): Promise<Record<string, CompanyInfo>> {
  const result: Record<string, CompanyInfo> = {};
  // TWSE listed companies with industry classification
  const urls = [
    'https://opendata.twse.com.tw/v1/opendata/t187ap03_L',
    'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?response=json&selectType=ALL',
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) continue;
      const body = await r.json();

      // Format: array of objects with 公司代號, 產業類別, 營業項目
      if (Array.isArray(body) && body.length > 0) {
        for (const row of body) {
          const code = (row['公司代號'] ?? row['Code'] ?? '').trim();
          if (!/^\d{4}$/.test(code)) continue;
          const symbol = code + '.TW';
          const industry = (row['產業類別'] ?? row['產業別'] ?? '').trim();
          // 營業項目 can be long, take first concept-like phrase
          const biz = (row['營業項目'] ?? '').trim();
          const concept = CONCEPT_TAGS[code] || extractConcept(biz);
          result[symbol] = { industry, concept };
        }
        if (Object.keys(result).length > 0) return result;
      }

      // Format 2: BWIBBU_d {fields, data} format
      if (body.fields && Array.isArray(body.data)) {
        const fields: string[] = body.fields.map((f: string) => f.trim());
        const codeIdx = fields.findIndex((f: string) => f.includes('證券代號'));
        const indIdx = fields.findIndex((f: string) => f.includes('產業'));
        if (codeIdx < 0) continue;
        for (const row of body.data) {
          const code = String(row[codeIdx]).trim();
          if (!/^\d{4}$/.test(code)) continue;
          const symbol = code + '.TW';
          const industry = indIdx >= 0 ? String(row[indIdx]).trim() : '';
          result[symbol] = { industry, concept: CONCEPT_TAGS[code] || '' };
        }
        if (Object.keys(result).length > 0) return result;
      }
    } catch { continue; }
  }
  return result;
}

async function fetchTPExIndustry(): Promise<Record<string, CompanyInfo>> {
  const result: Record<string, CompanyInfo> = {};
  try {
    const r = await fetch('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O', {
      headers: { 'User-Agent': UA },
    });
    if (!r.ok) return result;
    const body: any[] = await r.json();
    for (const row of body) {
      const code = (row['公司代號'] ?? '').trim();
      if (!/^\d{4}$/.test(code)) continue;
      const symbol = code + '.TWO';
      const industry = (row['產業類別'] ?? row['產業別'] ?? '').trim();
      const biz = (row['營業項目'] ?? '').trim();
      result[symbol] = { industry, concept: CONCEPT_TAGS[code] || extractConcept(biz) };
    }
  } catch { /* ignore */ }
  return result;
}

function extractConcept(biz: string): string {
  if (!biz) return '';
  // Try to extract a short concept from business description
  const keywords = [
    'AI', '人工智慧', '伺服器', '晶圓', '半導體', 'IC設計', '封裝', '測試',
    'PCB', '印刷電路', '散熱', '連接器', '光通訊', '網通', '5G',
    '面板', 'LED', '顯示器', '觸控',
    '電動車', '汽車', '車用', '電池', '儲能', '太陽能', '風電',
    '生技', '新藥', '醫療', '基因',
    '金融', '銀行', '保險', '證券',
    '鋼鐵', '水泥', '塑膠', '化學', '紡織', '食品',
    '航運', '航空', '物流',
    '機器人', '自動化', '工具機',
    '記憶體', 'DRAM', 'NAND', 'SSD',
    '軟體', '雲端', 'SaaS',
  ];
  for (const kw of keywords) {
    if (biz.includes(kw)) return kw;
  }
  return '';
}
