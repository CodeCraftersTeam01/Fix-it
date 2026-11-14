# FixIt Browser Injector

Agar FixIt bisa mendeteksi error website yang terjadi secara real-time
saat mahasiswa mengetik/mengeklik, tambahkan script ini di `<head>`
website mereka sebelum memanggil server dev.

## Cara Pakai

### Opsi A — Langsung ke `<head>` (untuk project static/Laravel/React)

```html
<script src="https://localhost:45678/fixit-inject.js" defer></script>
```

Atau gunakan versi inline (copy paste saja):

```html
<script>
(function(){
var s=document.createElement('script');
s.textContent='!function(){var f=function(e){var t=e.error,r=e.message,n=e.stack,o=e.type,a=e.filename,c=e.lineno,u=e.colno;if(!t&&r){var d=r;try{if(-1!==d.indexOf("Error:")){var g=d.split("Error:",2);t=g[0].trim();r=g.slice(1).join("Error:").trim()}else{var m=d.match(/^([A-Za-z$._]+Error):(.*)$/);if(m){t=m[1];r=m[2]}else t="Error";r=d}}catch(x){}}if(!n&&t&&(window.onerror||!window.__fixitNoOnError)){try{n=(new Error(r)).stack||""}catch(x){}}var p={message:r,error_type:t,type:o||"error",file_path:a||"",line_number:c||0,column_number:u||0,snippet:n?String(n).split("\\n")[1]||"":""};try{navigator.sendBeacon("http://127.0.0.1:45678/report",JSON.stringify(p))}catch(_){fetch("http://127.0.0.1:45678/report",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(p),mode:"no-cors"})}}}()}());
})();
window.__fixitReady=true;
</script>
```

### Opsi B — Vite/Next.js plugin (otomatis inject saat dev)

Tambahkan ke `vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    // ... plugin lain
  ],
  // Tambahkan script ke index.html head via transformIndexHtml
  optimizeDeps: { exclude: ['fixit-inject'] },
});
```

Atau tambahkan langsung di `index.html`:

```html
<head>
  <!-- FixIt integration -->
  <script src="https://localhost:45678/fixit-inject.js"></script>
</head>
```

### Opsi C — Manual copy-paste untuk project PHP/Laravel

Letakkan di `resources/views/app.blade.php` sebelum tag penutup `</head>`:

```php
@if(config('app.env') === 'local')
<script src="https://localhost:45678/fixit-inject.js"></script>
@endif
```

## Cara Kerja

1. Mahasiswa membuka website lokal (Vite, Laravel, Next.js, dll)
2. Saat terjadi error JS → `window.onerror` atau `unhandledrejection`
3. Script mengirim payload ke `POST 127.0.0.1:45678/report`
4. FixIt daemon menerimanya, parse error type & stack trace
5. HUD FixIt muncul menampilkan analisis AI untuk error tersebut

## Format Payload

```json
{
  "error_type": "ReferenceError",
  "message": "token is not defined",
  "type": "error",
  "file_path": "/path/to/file.js",
  "line_number": 25,
  "column_number": 9,
  "snippet": "at login (/app/auth.js:25:9)"
}
```

## Troubleshooting

- Pastikan FixIt app berjalan (daemon listen di port 45678)
- Jika CORS error, ubah ke `mode: 'no-cors'` (sudah termasuk di script)
- Untuk environment production, jangan inject script ini (cuma untuk local dev)
