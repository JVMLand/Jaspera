let current: HTMLDialogElement | undefined;
export async function openOfflinePreparation() {
  if (current?.open) {
    current.focus();
    return;
  }
  const dialog = document.createElement('dialog');
  current = dialog;
  dialog.setAttribute('aria-labelledby', 'offline-title');
  dialog.innerHTML =
    '<h2 id="offline-title">オフラインの準備</h2><p>回線のよい場所で，エディタ・命令辞書・Java 実行環境をこのブラウザに保存します。</p><p class="offline-status" role="status">容量を確認しています…</p><progress hidden aria-label="保存中"></progress><p>完了後は同じ URL をオフラインで開けます。サイトデータを削除した場合は，もう一度準備してください。</p><div class="dialog-actions"><button class="offline-start" disabled>保存する</button><button class="offline-close">閉じる</button></div>';
  document.body.append(dialog);
  dialog.showModal();
  const status = dialog.querySelector<HTMLElement>('.offline-status')!,
    start = dialog.querySelector<HTMLButtonElement>('.offline-start')!,
    progress = dialog.querySelector<HTMLProgressElement>('progress')!;
  dialog.querySelector<HTMLButtonElement>('.offline-close')!.onclick = () => dialog.close();
  dialog.onclose = () => {
    dialog.remove();
    if (current === dialog) current = undefined;
  };
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !isSecureContext) {
    status.textContent =
      'オフライン保存は，HTTPS または localhost で配信された本番版で利用できます。';
    return;
  }
  const base = new URL(import.meta.env.BASE_URL, location.href);
  let urls: string[] = [];
  const complete = async () =>
    urls.length > 0 &&
    (
      await Promise.all(urls.map((url) => caches.match(new URL(url, base), { ignoreSearch: true })))
    ).every(Boolean);
  try {
    const response = await fetch(new URL('offline-manifest.json', base));
    if (!response.ok) throw new Error('保存に必要なファイルを確認できませんでした。');
    const manifest = await response.json();
    urls = manifest.urls;
    status.textContent = `保存容量の目安：${(manifest.bytes / 1024 / 1024).toFixed(1)} MiB。未保存・更新されたファイルを取得します。`;
    start.disabled = false;
  } catch (error) {
    status.textContent = String(error);
    return;
  }
  start.onclick = async () => {
    start.disabled = true;
    progress.hidden = false;
    status.textContent = '保存しています。回線が遅い場合は，そのままお待ちください。';
    try {
      if (!navigator.onLine) {
        if (await complete()) {
          status.textContent = '保存済みです。オフラインで利用できます。';
          return;
        }
        throw new Error('準備を完了するにはネットワーク接続が必要です。');
      }
      const existing = await navigator.serviceWorker.getRegistration(base.href);
      const workerUrl = new URL('sw.js', base);
      // A distinct script URL forces installation even when an active worker lost cache entries.
      if (existing?.active && !(await complete()))
        workerUrl.searchParams.set('repair', String(Date.now()));
      const registration = await navigator.serviceWorker.register(workerUrl, {
        scope: base.href,
        updateViaCache: 'none',
      });
      await registration.update();
      const worker = registration.installing ?? registration.waiting ?? registration.active;
      if (!worker) throw new Error('保存処理を開始できませんでした。');
      await new Promise<void>((resolve, reject) => {
        const check = () => {
          if (['installed', 'activated'].includes(worker.state)) {
            worker.removeEventListener('statechange', check);
            resolve();
          } else if (worker.state === 'redundant') {
            worker.removeEventListener('statechange', check);
            reject(new Error('保存できませんでした。回線と空き容量を確認して再試行してください。'));
          }
        };
        worker.addEventListener('statechange', check);
        check();
      });
      if (!(await complete()))
        throw new Error(
          '一部のデータを保存できませんでした。回線と空き容量を確認して再試行してください。',
        );
      await navigator.storage?.persist?.().catch(() => false);
      status.textContent = registration.waiting
        ? '更新分の保存が完了しました。Jaspera のタブと小窓をすべて閉じてから，開き直してください。'
        : '保存が完了しました。オフラインでも起動・編集・実行できます。';
      start.textContent = 'もう一度確認';
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      progress.hidden = true;
      start.disabled = false;
    }
  };
}
