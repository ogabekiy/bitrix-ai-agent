# Bitrix AI yordamchisi

Bitrix24 ma’lumotlari bilan ishlaydigan, o‘zbek tilidagi sodda chat ilovasi. Oddiy savollarga Claude Haiku javob beradi. Bitrix CRM haqida so‘ralganda server REST webhook orqali ma’lumot oladi, Claude esa natijani qisqa va tushunarli qilib bayon qiladi.

## Talablar

- Node.js 20 yoki undan yangi versiya
- Anthropic API kaliti
- Bitrix24 incoming webhook. Webhook yaratuvchida kerakli CRM ma’lumotlarini o‘qish huquqi bo‘lishi shart.

## Sozlash

Loyiha papkasida `.env` faylini yarating:

```env
CLAUDE_API_KEY=your_anthropic_api_key
BITRIX24_API_URL=https://your-portal.bitrix24.com/rest/USER_ID/WEBHOOK_TOKEN/
PORT=3000
```

`BITRIX24_API_URL` qiymati Bitrix incoming webhook’ning asosiy URL’i bo‘lishi mumkin; server so‘rovga mos REST metodini o‘zi qo‘shadi. To‘liq metod URL’i berilsa, uning oxiridagi metod qismi so‘rovga moslab almashtiriladi.

`.env` ichida maxfiy API kalitlari va webhook tokeni bor. Uni Git’ga qo‘shmang yoki boshqalarga yubormang. `.gitignore` `.env` fayllarini e’tiborsiz qoldiradi.

## Ishga tushirish

```sh
npm start
```

Brauzerda [http://localhost:3000](http://localhost:3000) manzilini oching. Dasturlash paytida Node.js watch rejimini ishlatish:

```sh
npm run dev
```

## Chat API

Ilгээх endpoint: `POST /api/chat`

```json
{"message":"Oxirgi lidlar ro‘yxatini ko‘rsat"}
```

Bitrix bo‘yicha tanilgan so‘rovlar:

| So‘rov turi | Bitrix REST metodi |
| --- | --- |
| Lidlar | `crm.lead.list` |
| Bitimlar | `crm.deal.list` |
| Kontaktlar | `crm.contact.list` |
| Kompaniyalar | `crm.company.list` |
| Faoliyatlar | `crm.activity.list` |
| Xodimlar | `user.get` |

Javob tayyorlash uchun ko‘pi bilan 30 ta Bitrix yozuvi Claude’ga uzatiladi. `.env` yoki API kalitlarini frontend’ga yubormang.

## Muammolarni bartaraf etish

- `CLAUDE_API_KEY` xatosi: `.env`dagi kalit va Anthropic API ruxsatini tekshiring.
- Bitrix `higher privileges` xatosi: webhook CRM ma’lumotlarini o‘qish huquqiga ega bo‘lishi kerak. Bitrix24 administratoridan tegishli huquqli webhook so‘rang.
- `.env` o‘zgargandan so‘ng serverni qayta ishga tushiring.
