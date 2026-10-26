// Full-screen barcode scanner: rear camera + native BarcodeDetector, with manual entry fallback.
import { icon, esc, vibrate, HAPTIC } from './ui.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const VALID = /^\d{6,14}$/;

/** Opens the scan view. Resolves with the barcode digits, or null when closed. */
export function openScanner() {
  return new Promise(async (resolve) => {
    const el = document.createElement('div');
    el.className = 'scan-overlay';
    el.innerHTML = `
      <video class="scan-video" playsinline muted autoplay></video>
      <div class="scan-shade"></div>
      <div class="scan-top">
        <button type="button" class="icon-btn press" data-s="close" aria-label="סגירה">${icon('x')}</button>
        <h2>סריקת ברקוד</h2>
      </div>
      <div class="scan-frame" aria-hidden="true"><span class="scan-line"></span></div>
      <div class="scan-bottom">
        <p class="scan-msg muted"></p>
        <div class="scan-manual" hidden>
          <label class="field"><span>מספר הברקוד</span>
            <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="14" autocomplete="off" name="barcode" enterkeyhint="search"></label>
          <button type="button" class="btn primary block press" data-s="submit">${icon('search')}<span>חיפוש מוצר</span></button>
        </div>
        <button type="button" class="btn ghost block press" data-s="manual">${icon('keyboard')}<span>הקלדה ידנית של ברקוד</span></button>
      </div>`;
    document.body.appendChild(el);
    document.body.classList.add('no-scroll');
    requestAnimationFrame(() => el.classList.add('open'));

    const video = el.querySelector('video');
    const msg = el.querySelector('.scan-msg');
    const manualBox = el.querySelector('.scan-manual');
    const input = el.querySelector('[name=barcode]');
    let stream = null;
    let done = false;
    let timer = 0;

    const stopCamera = () => {
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      video.srcObject = null;
    };
    const close = (value) => {
      if (done) return;
      done = true;
      stopCamera();
      document.removeEventListener('visibilitychange', onVis);
      el.classList.remove('open');
      setTimeout(() => {
        el.remove();
        if (!document.querySelector('.sheet-backdrop')) document.body.classList.remove('no-scroll');
      }, 220);
      resolve(value);
    };
    const showManual = (text) => {
      el.classList.add('manual');
      manualBox.hidden = false;
      el.querySelector('[data-s=manual]').hidden = true;
      if (text) msg.textContent = text;
      setTimeout(() => input.focus(), 50);
    };
    const submit = () => {
      const code = input.value.replace(/\D/g, '');
      if (!VALID.test(code)) {
        input.classList.add('invalid');
        msg.textContent = 'ברקוד צריך להכיל 6 עד 14 ספרות';
        setTimeout(() => input.classList.remove('invalid'), 1200);
        return;
      }
      close(code);
    };
    // Leaving the app stops the camera; it's not restarted automatically.
    const onVis = () => {
      if (document.visibilityState === 'hidden' && stream) {
        stopCamera();
        showManual('המצלמה נעצרה. אפשר להקליד ברקוד או לסגור ולפתוח שוב.');
      }
    };
    document.addEventListener('visibilitychange', onVis);

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-s]');
      if (!b) return;
      if (b.dataset.s === 'close') close(null);
      else if (b.dataset.s === 'manual') showManual('');
      else if (b.dataset.s === 'submit') submit();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close(null);
    });

    // Camera + detector
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
      showManual('הדפדפן הזה לא תומך בסריקה במצלמה. אפשר להקליד את הספרות שמתחת לברקוד.');
      return;
    }
    let detector;
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const formats = FORMATS.filter((f) => supported.includes(f));
      if (!formats.length) throw new Error('no formats');
      detector = new window.BarcodeDetector({ formats });
    } catch {
      showManual('סריקת ברקודים לא זמינה במכשיר הזה. אפשר להקליד את הספרות.');
      return;
    }
    try {
      msg.textContent = 'מכוונים את הברקוד למסגרת';
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (done) return stopCamera(); // closed while the permission prompt was open
      video.srcObject = stream;
      await video.play();
    } catch (err) {
      stopCamera();
      showManual(err?.name === 'NotAllowedError'
        ? 'אין הרשאה למצלמה. אפשר לאשר בהגדרות הדפדפן, או להקליד ברקוד.'
        : 'לא ניתן לפתוח את המצלמה. אפשר להקליד ברקוד.');
      return;
    }

    const scan = async () => {
      if (done || !stream) return;
      try {
        if (video.readyState >= 2) {
          const codes = await detector.detect(video);
          const hit = codes.find((c) => VALID.test(c.rawValue));
          if (hit) {
            vibrate(HAPTIC.item);
            el.classList.add('found');
            msg.innerHTML = `נמצא: <bdi class="num" dir="ltr">${esc(hit.rawValue)}</bdi>`;
            setTimeout(() => close(hit.rawValue), 250);
            return;
          }
        }
      } catch {
        /* transient detection error — keep scanning */
      }
      timer = setTimeout(scan, 200);
    };
    scan();
  });
}
