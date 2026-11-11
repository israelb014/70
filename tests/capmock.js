// A mocked Capacitor native bridge for Playwright (page.addInitScript). It makes the web app believe it runs
// inside the Android app: window.Capacitor.isNativePlatform() is true, plugin calls go to the fakes below
// and every call is recorded in window.__cap.calls. Tests steer it through window.__cap (state + fire()).
(() => {
  const st = window.__capInit || {};
  const fs = new Map(); // `${directory}/${path}` → data
  const pending = [];
  const listeners = [];
  const cap = window.__cap = {
    calls: [], fs, pending, listeners,
    hc: st.hc || { available: true, granted: ['steps', 'sleep', 'exercise'], data: { steps: [], sleep: [], exercise: [] } },
    launchUrl: st.launchUrl || null,
    barcode: st.barcode ?? '7290000000011',
    icon: 'flame',
    notifPermission: 'granted',
    fire(plugin, event, data) { listeners.filter((l) => l.plugin === plugin && l.event === event).forEach((l) => l.cb(data)); },
    count(plugin, method) { return cap.calls.filter((c) => c.plugin === plugin && (!method || c.method === method)).length; },
  };
  const ok = (v) => Promise.resolve(v ?? {});
  const PLUGINS = {
    Haptics: { impact: ok, notification: ok, vibrate: ok },
    KeepAwake: { keepAwake: ok, allowSleep: ok },
    StatusBar: { setStyle: ok, setBackgroundColor: ok },
    App: {
      getLaunchUrl: () => ok(cap.launchUrl ? { url: cap.launchUrl } : {}),
      exitApp: ok,
    },
    Filesystem: {
      writeFile: (o) => { fs.set(`${o.directory}/${o.path}`, o.data); return ok({ uri: `file:///${o.directory}/${o.path}` }); },
      readFile: (o) => (fs.has(`${o.directory}/${o.path}`) ? ok({ data: fs.get(`${o.directory}/${o.path}`) }) : Promise.reject(new Error('missing'))),
      readdir: (o) => ok({ files: [...fs.keys()].filter((k) => k.startsWith(`${o.directory}/${o.path}/`)).map((k) => ({ name: k.split('/').pop() })) }),
      deleteFile: (o) => { fs.delete(`${o.directory}/${o.path}`); return ok(); },
    },
    Share: { share: ok },
    Camera: { getPhoto: () => (st.photo ? ok({ base64String: st.photo, format: 'jpeg' }) : Promise.reject(new Error('cancelled'))) },
    BarcodeScanner: {
      isGoogleBarcodeScannerModuleAvailable: () => ok({ available: true }),
      installGoogleBarcodeScannerModule: ok,
      scan: () => (cap.barcode ? ok({ barcodes: [{ rawValue: cap.barcode }] }) : Promise.reject(new Error('cancelled'))),
    },
    LocalNotifications: {
      checkPermissions: () => ok({ display: cap.notifPermission }),
      requestPermissions: () => ok({ display: cap.notifPermission }),
      getPending: () => ok({ notifications: pending.map((n) => ({ id: n.id })) }),
      cancel: (o) => { for (const { id } of o.notifications) { const i = pending.findIndex((n) => n.id === id); if (i >= 0) pending.splice(i, 1); } return ok(); },
      schedule: (o) => { pending.push(...o.notifications); return ok(); },
    },
    HealthConnect: {
      getStatus: () => ok({ available: cap.hc.available, granted: cap.hc.available ? cap.hc.granted : [] }),
      connect: () => ok({ available: cap.hc.available, granted: cap.hc.available ? cap.hc.granted : [] }),
      readData: () => (cap.hc.available ? ok({ ...cap.hc.data, granted: cap.hc.granted }) : Promise.reject(new Error('not available'))),
    },
    AppIcon: {
      getActive: () => ok({ name: cap.icon }),
      setActive: (o) => { cap.icon = o.name; return ok({ name: o.name }); },
    },
  };
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    nativePromise(plugin, method, options) {
      cap.calls.push({ plugin, method, options: JSON.parse(JSON.stringify(options ?? {})) });
      const fn = PLUGINS[plugin]?.[method];
      return fn ? fn(options || {}) : Promise.reject(new Error(`${plugin}.${method} not implemented`));
    },
    addListener(plugin, event, cb) {
      const l = { plugin, event, cb };
      listeners.push(l);
      return { remove: async () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); } };
    },
  };
})();
