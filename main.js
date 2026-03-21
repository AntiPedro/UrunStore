const { app, BrowserWindow, shell, ipcMain, Menu, Tray, nativeImage, session } = require('electron');
const path = require('path');
const os = require('os');
const { autoUpdater } = require('electron-updater');

// Tek instance kontrolü - sadece bir pencere açılsın
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Ürün Store',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    
    // Frameless pencere - kendi title bar'ımızı kullanacağız
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#050507',
      symbolColor: '#94a3b8',
      height: 40
    },

    // Temiz, koyu arkaplan
    backgroundColor: '#050507',
    
    // Web tercihleri
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
      // Web sayfasının dış linkleri açabilmesi için
      webviewTag: false,
    },

    // Başlangıç animasyonu
    show: false,
  });

  // Pencere hazır olunca göster (splash screen efekti)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // store.html'yi yükle
  mainWindow.loadFile('store.html');

  // Geliştirici modunda DevTools aç
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Dış linkleri varsayılan tarayıcıda aç
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Navigasyon engelle (güvenlik)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    // Supabase auth callback'lerine izin ver
    if (parsedUrl.hostname === 'qyyxblsytifczxcgpvpi.supabase.co') {
      return;
    }
    // Yerel dosyalar hariç diğer navigasyonları engelle
    if (parsedUrl.protocol !== 'file:') {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Kapatma davranışı - tray'e küçült
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
    return true;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

}

// Uygulama menüsünü özelleştir
function createMenu() {
  const template = [
    {
      label: 'Ürün Store',
      submenu: [
        { label: 'Hakkında', role: 'about' },
        { type: 'separator' },
        {
          label: 'Geliştirici Araçları',
          accelerator: 'F12',
          click: () => {
            if (mainWindow) mainWindow.webContents.toggleDevTools();
          }
        },
        {
          label: 'Yeniden Yükle',
          accelerator: 'Ctrl+R',
          click: () => {
            if (mainWindow) mainWindow.reload();
          }
        },
        { type: 'separator' },
        {
          label: 'Çıkış',
          accelerator: 'Ctrl+Q',
          click: () => {
            app.isQuitting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Düzen',
      submenu: [
        { label: 'Geri Al', role: 'undo' },
        { label: 'İleri Al', role: 'redo' },
        { type: 'separator' },
        { label: 'Kes', role: 'cut' },
        { label: 'Kopyala', role: 'copy' },
        { label: 'Yapıştır', role: 'paste' },
        { label: 'Tümünü Seç', role: 'selectAll' }
      ]
    },
    {
      label: 'Görünüm',
      submenu: [
        { label: 'Tam Ekran', role: 'togglefullscreen' },
        { label: 'Yakınlaştır', role: 'zoomIn' },
        { label: 'Uzaklaştır', role: 'zoomOut' },
        { label: 'Sıfırla', role: 'resetZoom' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// System Tray oluştur
function createTray() {
  // Basit bir 16x16 ikon oluştur (icon dosyası yoksa)
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let trayIcon;
  
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      // İkon bulunamadı, basit bir ikon oluştur
      trayIcon = nativeImage.createEmpty();
    }
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } catch (e) {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Ürün Store\'u Göster',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Çıkış',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Ürün Store');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// IPC Handlers - Renderer ile iletişim
ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

let hiddenDownloadWindows = [];

// Download handler
ipcMain.handle('download:start', (event, url) => {
  if (mainWindow) {
    // We create a hidden browser window. This is crucial because many file hosts
    // use Javascript or meta-refresh to trigger downloads. downloadURL() does not run JS.
    let dlWin = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    
    // Set a normal Chrome user agent to prevent blocks
    dlWin.webContents.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    
    // Load the URL to trigger the auto-download via JS
    dlWin.loadURL(url);
    
    hiddenDownloadWindows.push(dlWin);

    // Clean up window when download finishes or fails (handled by global will-download)
    // We will keep it alive temporarily. We could set a timeout to close it.
    setTimeout(() => {
      if(!dlWin.isDestroyed()) {
         dlWin.close();
         hiddenDownloadWindows = hiddenDownloadWindows.filter(w => w !== dlWin);
      }
    }, 60000); // Allow 60 seconds for JS redirect to trigger the download
  }
});

// Uygulama hazır
app.whenReady().then(() => {
  createMenu();
  createWindow();
  createTray();

  // Otomatik güncellemeleri kontrol et
  autoUpdater.checkForUpdatesAndNotify();

  // Global indirme dinleyicisi (Sadece BİR KEZ eklenmeli, böylece duplicate engellenir)
  session.defaultSession.on('will-download', (event, item, webContents) => {
    // İndirmeyi doğrudan masaüstüne kaydet (farklı kaydet sorma)
    const desktopPath = path.join(os.homedir(), 'Desktop');
    item.setSavePath(path.join(desktopPath, item.getFilename()));

    item.on('updated', (event, state) => {
      if (state === 'progressing') {
        const progress = Math.round((item.getReceivedBytes() / item.getTotalBytes()) * 100) || 0;
        if (mainWindow) {
          mainWindow.webContents.send('download:progress', {
            filename: item.getFilename(),
            progress: progress,
            received: item.getReceivedBytes(),
            total: item.getTotalBytes()
          });
        }
      }
    });

    item.once('done', (event, state) => {
      if (mainWindow) {
        mainWindow.webContents.send('download:complete', {
          filename: item.getFilename(),
          state: state
        });
      }
    });
  });
});

// AutoUpdater Olayları
autoUpdater.on('checking-for-update', () => {
  if (mainWindow) mainWindow.webContents.send('updater:status', { message: 'Güncellemeler kontrol ediliyor...', type: 'info' });
});

autoUpdater.on('update-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('updater:status', { message: 'Yeni bir güncelleme bulundu! İndiriliyor...', type: 'success' });
});

autoUpdater.on('update-not-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('updater:status', { message: 'Uygulama zaten en güncel sürümde.', type: 'info' });
});

autoUpdater.on('error', (err) => {
  if (mainWindow) mainWindow.webContents.send('updater:status', { message: 'Güncelleme hatası: ' + err.message, type: 'error' });
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = 'Güncelleme İndiriliyor: %' + Math.round(progressObj.percent);
  if (mainWindow) mainWindow.webContents.send('updater:status', { message: log_message, type: 'info' });
});

autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow) mainWindow.webContents.send('updater:status', { message: 'Güncelleme indirildi! Uygulama 3 saniye içinde yeniden başlatılacak.', type: 'success' });
  setTimeout(() => {
    autoUpdater.quitAndInstall();
  }, 3000);
});

// İkinci instance açılmaya çalışıldığında
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// Tüm pencereler kapandığında
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Uygulama kapanırken
app.on('before-quit', () => {
  app.isQuitting = true;
});
