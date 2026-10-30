/* Carrega o Firebase só quando preciso (no modo demo nada é carregado). */
(function () {
  const BASE = "https://www.gstatic.com/firebasejs/10.14.1/";
  let cache = null;

  window.getFirebase = function () {
    if (!cache) {
      cache = (async () => {
        const [appMod, authMod, fsMod] = await Promise.all([
          import(BASE + "firebase-app.js"),
          import(BASE + "firebase-auth.js"),
          import(BASE + "firebase-firestore.js")
        ]);
        const app = appMod.initializeApp(window.APP.firebaseConfig);
        return { ...authMod, ...fsMod, auth: authMod.getAuth(app), db: fsMod.getFirestore(app) };
      })();
    }
    return cache;
  };
})();
