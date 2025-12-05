// 导入JSZip库用于压缩打包
importScripts('lib/jszip.min.js');

class NetworkCapture {
  constructor() {
    this.tabId = null;
    this.isCapturing = false;
    this.networkRequests = new Map();
    this.db = null;
    this.initDB();
  }

  // 初始化IndexedDB数据库
  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('NetworkCaptureDB', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 创建请求存储表
        if (!db.objectStoreNames.contains('networkRequests')) {
          const store = db.createObjectStore('networkRequests', { keyPath: 'requestId' });
          store.createIndex('tabId', 'tabId', { unique: false });
          store.createIndex('url', 'url', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('contentType', 'contentType', { unique: false });
        }

        // 创建文件存储表
        if (!db.objectStoreNames.contains('savedFiles')) {
          const fileStore = db.createObjectStore('savedFiles', { keyPath: 'fileId' });
          fileStore.createIndex('requestId', 'requestId', { unique: false });
          fileStore.createIndex('domain', 'domain', { unique: false });
        }
      };
    });
  }

  // 开始捕获网络请求
  async startCapture(tabId) {
    if (this.isCapturing) {
      console.log('已经在捕获状态，跳过启动');
      return true;
    }

    console.log(`开始捕获标签页 ${tabId} 的网络请求`);
    this.tabId = tabId;
    this.isCapturing = true;
    // 不清空内存中的请求数据，保持累积
    // this.networkRequests.clear();

    try {
      console.log('附加调试器到标签页:', tabId);
      await new Promise((resolve, reject) => {
        chrome.debugger.attach({ tabId }, '1.3', () => {
          if (chrome.runtime.lastError) {
            console.error('调试器附加失败:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            console.log('调试器附加成功');
            resolve();
          }
        });
      });

      // 启用网络域
      console.log('启用Network域');
      await new Promise((resolve, reject) => {
        chrome.debugger.sendCommand({ tabId }, 'Network.enable', {}, (result) => {
          if (chrome.runtime.lastError) {
            console.error('Network.enable失败:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            console.log('Network.enable成功:', result);
            resolve(result);
          }
        });
      });

      console.log(`网络捕获启动成功，标签页: ${tabId}`);
      return true;
    } catch (error) {
      console.error('启动网络捕获失败:', error);
      this.isCapturing = false;
      this.tabId = null;
      return false;
    }
  }

  // 停止捕获
  async stopCapture() {
    if (!this.isCapturing) return;

    try {
      await new Promise((resolve) => {
        chrome.debugger.detach({ tabId: this.tabId }, () => {
          resolve();
        });
      });

      // 只清空内存中的请求数据，不清空数据库
      this.networkRequests.clear();

      this.isCapturing = false;
      this.tabId = null;
      console.log('停止网络捕获');
      return true;
    } catch (error) {
      console.error('停止网络捕获失败:', error);
      return false;
    }
  }

  // 保存网络请求到数据库
  async saveRequest(requestData) {
    if (!this.db) await this.initDB();

    console.log('正在保存/更新请求数据:', requestData);

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['networkRequests'], 'readwrite');
      const store = transaction.objectStore('networkRequests');

      // 使用put而不是add，这样如果键已存在就会更新而不是报错
      const request = store.put(requestData);
      request.onsuccess = () => {
        console.log('请求数据保存成功:', requestData.requestId);
        resolve(request.result);
      };
      request.onerror = () => {
        console.error('请求数据保存失败:', request.error);
        reject(request.error);
      };
    });
  }

  // 获取所有捕获的请求
  async getAllRequests(tabId) {
    if (!this.db) await this.initDB();

    console.log('获取标签页请求:', tabId);

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['networkRequests'], 'readonly');
      const store = transaction.objectStore('networkRequests');
      const index = store.index('tabId');
      const request = index.getAll(tabId);

      request.onsuccess = () => {
        console.log('获取到请求数量:', request.result.length);
        resolve(request.result);
      };
      request.onerror = () => {
        console.error('获取请求失败:', request.error);
        reject(request.error);
      };
    });
  }

  // 清空指定标签页的请求数据
  async clearTabRequests(tabId) {
    if (!this.db) await this.initDB();

    console.log('清空标签页请求数据:', tabId);

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['networkRequests'], 'readwrite');
      const store = transaction.objectStore('networkRequests');
      const index = store.index('tabId');
      const request = index.getAllKeys(tabId);

      request.onsuccess = () => {
        const keys = request.result;
        console.log('找到要删除的请求数量:', keys.length);

        // 删除所有找到的请求
        let deleteCount = 0;
        keys.forEach(key => {
          const deleteRequest = store.delete(key);
          deleteRequest.onsuccess = () => {
            deleteCount++;
            if (deleteCount === keys.length) {
              console.log('标签页数据清空完成');
              resolve();
            }
          };
          deleteRequest.onerror = () => {
            console.error('删除请求失败:', deleteRequest.error);
            reject(deleteRequest.error);
          };
        });

        if (keys.length === 0) {
          resolve();
        }
      };

      request.onerror = () => {
        console.error('获取要删除的请求失败:', request.error);
        reject(request.error);
      };
    });
  }

  // 按域名保存文件到本地
  async saveFileLocally(url, content, contentType) {
    try {
      // 解析URL获取文件路径
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const pathname = urlObj.pathname;

      // 确定文件扩展名
      let extension = '';
      if (contentType.includes('text/html')) {
        extension = '.html';
      } else if (contentType.includes('text/css')) {
        extension = '.css';
      } else if (contentType.includes('application/javascript') || contentType.includes('text/javascript')) {
        extension = '.js';
      } else if (contentType.includes('application/json')) {
        extension = '.json';
      } else if (contentType.includes('image/')) {
        const imageType = contentType.split('/')[1];
        extension = '.' + imageType;
      }

      // 构造文件名
      let filename = pathname;
      if (filename.endsWith('/')) {
        filename += 'index';
      }
      if (!filename.includes('.') && extension) {
        filename += extension;
      }

      // 清理文件名中的特殊字符
      filename = filename.replace(/[^a-zA-Z0-9\-_\.\/]/g, '_');

      // 创建blob数据
      const blob = new Blob([content], { type: contentType });

      // 在Service Worker中，我们不能使用URL.createObjectURL
      // 改用data URL格式
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;

          // 使用Chrome下载API保存文件
          chrome.downloads.download({
            url: dataUrl,
            filename: `${domain}${filename}`,
            saveAs: false
          }, (downloadId) => {
            if (chrome.runtime.lastError) {
              console.error('下载文件失败:', chrome.runtime.lastError);
              reject(chrome.runtime.lastError);
            } else {
              console.log(`文件已保存: ${domain}${filename}`);

              // 保存文件记录到数据库
              this.saveFileRecord(url, downloadId, domain, filename);
              resolve(downloadId);
            }
          });
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });

    } catch (error) {
      console.error('保存文件失败:', error);
      throw error;
    }
  }

  // 保存文件记录到数据库
  async saveFileRecord(url, downloadId, domain, filename) {
    if (!this.db) await this.initDB();

    const fileRecord = {
      fileId: downloadId.toString(),
      requestId: this.generateRequestId(url),
      url: url,
      domain: domain,
      filename: filename,
      savedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['savedFiles'], 'readwrite');
      const store = transaction.objectStore('savedFiles');

      const request = store.add(fileRecord);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 生成请求ID
  generateRequestId(url) {
    return btoa(url + Date.now()).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
  }

  // 处理网络事件
  async handleNetworkEvent(method, params) {
    if (!this.isCapturing) return;

    switch (method) {
      case 'Network.requestWillBeSent':
        await this.handleRequestWillBeSent(params);
        break;
      case 'Network.responseReceived':
        await this.handleResponseReceived(params);
        break;
      case 'Network.loadingFinished':
        await this.handleLoadingFinished(params);
        break;
    }
  }

  // 处理请求即将发送事件
  async handleRequestWillBeSent(params) {
    const requestInfo = {
      requestId: params.requestId,
      tabId: this.tabId,
      type: params.type,
      method: params.request.method,
      url: params.request.url,
      timestamp: params.timestamp,
      requestHeaders: params.request.headers,
      postData: params.request.postData,
      contentType: 'unknown', // 初始设置，将在response阶段更新
      mimeType: ''
    };

    this.networkRequests.set(params.requestId, requestInfo);
    // 不在这里保存，等到response阶段再保存完整信息
  }

  // 处理响应接收事件
  async handleResponseReceived(params) {
    let requestInfo = this.networkRequests.get(params.requestId);

    // 如果内存中没有这个请求，先创建一个基础信息
    if (!requestInfo) {
      requestInfo = {
        requestId: params.requestId,
        tabId: this.tabId,
        type: 'Other',
        method: 'GET',
        url: 'Unknown',
        timestamp: params.timestamp,
        requestHeaders: {},
        postData: null,
        contentType: 'unknown',
        mimeType: ''
      };
    }

    const responseInfo = {
      ...requestInfo,
      status: params.response.status,
      statusText: params.response.statusText,
      responseHeaders: params.response.headers,
      mimeType: params.response.mimeType,
      contentType: this.getContentType(params.response.mimeType)
    };

    this.networkRequests.set(params.requestId, responseInfo);
    // 保存基础响应信息（不包括响应体）
    await this.saveRequest(responseInfo);
  }

  // 处理加载完成事件
  async handleLoadingFinished(params) {
    let requestInfo = this.networkRequests.get(params.requestId);
    if (!requestInfo) {
      // 如果内存中没有这个请求，创建一个基础信息
      requestInfo = {
        requestId: params.requestId,
        tabId: this.tabId,
        type: 'Other',
        method: 'GET',
        url: 'Unknown',
        timestamp: params.timestamp,
        requestHeaders: {},
        postData: null,
        contentType: 'unknown',
        mimeType: ''
      };
    }

    try {
      // 更新响应大小信息
      const updatedRequest = {
        ...requestInfo,
        responseSize: params.encodedDataLength || 0
      };

      // 保存更新后的请求信息（即使没有响应体）
      await this.saveRequest(updatedRequest);

      // 尝试获取响应体（这是一个可选操作）
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.debugger.sendCommand(
            { tabId: this.tabId },
            'Network.getResponseBody',
            { requestId: params.requestId },
            (result) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(result);
              }
            }
          );
        });

        // 成功获取响应体，更新完整信息
        const completeRequest = {
          ...updatedRequest,
          responseBody: response.body,
          base64Encoded: response.base64Encoded
        };

        // 保存包含响应体的完整信息
        await this.saveRequest(completeRequest);

        console.log('请求已保存到数据库:', {
          url: completeRequest.url,
          contentType: completeRequest.contentType,
          mimeType: completeRequest.mimeType,
          hasBody: !!completeRequest.responseBody
        });

      } catch (responseError) {
        // 获取响应体失败，但这不影响基本请求信息的保存
        console.log('无法获取响应体，但请求信息已保存:', responseError.message);
      }

    } catch (error) {
      console.error('处理加载完成事件失败:', error);
    }
  }

  // 获取内容类型
  getContentType(mimeType) {
    if (!mimeType) return 'unknown';

    if (mimeType.includes('text/html')) return 'html';
    if (mimeType.includes('text/css')) return 'css';
    if (mimeType.includes('application/javascript') || mimeType.includes('text/javascript')) return 'javascript';
    if (mimeType.includes('application/json')) return 'json';
    if (mimeType.includes('image/')) return 'image';
    if (mimeType.includes('font/')) return 'font';
    if (mimeType.includes('video/')) return 'video';
    if (mimeType.includes('audio/')) return 'audio';

    return 'other';
  }

  // 将响应体转换为Uint8Array，支持base64和文本
  getBodyBuffer(request) {
    if (!request.responseBody) return new Uint8Array();

    if (request.base64Encoded) {
      // Base64解码
      const binary = atob(request.responseBody);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }

    // 文本编码
    return new TextEncoder().encode(request.responseBody);
  }

  // 根据URL构造安全的文件路径
  buildFilePath(url, contentType, mimeType) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/[^a-zA-Z0-9\.\-]/g, '_');
      let pathname = urlObj.pathname || '/';

      // 如果路径以/结尾，添加默认文件名
      if (pathname.endsWith('/')) {
        const fallbackExt =
          contentType === 'css' ? '.css' :
          contentType === 'javascript' ? '.js' :
          contentType === 'json' ? '.json' :
          '.html';
        pathname = pathname + 'index' + fallbackExt;
      }

      // 清理路径中的特殊字符
      const safePath = pathname.split('/').map(seg =>
        seg.replace(/[^a-zA-Z0-9\-\._]/g, '_')
      ).join('/');

      // 处理query参数和hash，避免文件覆盖
      let queryHash = '';
      if (urlObj.search || urlObj.hash) {
        // 创建一个简单的hash来标识不同的query参数
        const queryString = (urlObj.search + urlObj.hash).replace(/[^a-zA-Z0-9]/g, '');
        // 使用前8个字符作为标识符
        queryHash = queryString.substring(0, 8) || 'noquery';
      }

      // 如果没有扩展名，根据mimeType添加
      let fullPath = `${domain}${safePath}`;

      // 如果有query或hash，在扩展名前插入hash
      if (queryHash) {
        const lastDotIndex = fullPath.lastIndexOf('.');
        if (lastDotIndex > 0) {
          fullPath = fullPath.substring(0, lastDotIndex) + `_${queryHash}` + fullPath.substring(lastDotIndex);
        } else {
          fullPath += `_${queryHash}`;
        }
      }

      // 如果没有扩展名，根据mimeType添加
      if (!fullPath.match(/\.[a-zA-Z0-9]+$/) && mimeType) {
        if (mimeType.includes('image/')) {
          const ext = mimeType.split('/')[1] || 'img';
          fullPath += '.' + ext.replace(/[^a-zA-Z0-9]/g, '');
        } else if (mimeType.includes('font/')) {
          fullPath += '.font';
        }
      }

      return fullPath.startsWith('/') ? fullPath.slice(1) : fullPath;
    } catch (error) {
      console.error('构建文件路径失败:', error);
      return `unknown_${Date.now()}`;
    }
  }

  // 创建ZIP并触发下载
  async createZipForTab(tabId, options = {}) {
    try {
      if (!this.db) await this.initDB();

      console.log(`开始为标签页 ${tabId} 创建ZIP...`);
      const requests = await this.getAllRequests(tabId);

      if (!requests || requests.length === 0) {
        throw new Error('没有找到任何请求数据');
      }

      // 预估总大小（以MB为单位）
      const totalSize = requests.reduce((sum, req) => {
        return sum + (req.responseSize || 0);
      }, 0);
      const totalSizeMB = totalSize / 1024 / 1024;

      console.log(`预估总大小: ${totalSizeMB.toFixed(2)}MB`);

      // 如果总大小超过200MB，记录警告
      if (totalSizeMB > 200) {
        console.warn(`警告：数据量较大 (${totalSizeMB.toFixed(2)}MB)，可能需要较长时间处理`);
      }

      const zip = new JSZip();
      const manifest = [];
      let processedCount = 0;
      let skippedCount = 0;

      // 遍历所有请求，添加到ZIP中
      for (const req of requests) {
        if (!req.responseBody) {
          skippedCount++;
          continue;
        }

        try {
          const filePath = this.buildFilePath(req.url, req.contentType, req.mimeType);
          const buffer = this.getBodyBuffer(req);

          // 添加文件到ZIP
          zip.file(filePath, buffer, { binary: true });

          // 记录到manifest
          manifest.push({
            url: req.url,
            status: req.status,
            method: req.method,
            size: req.responseSize || buffer.length,
            type: req.contentType,
            mimeType: req.mimeType,
            savedAs: filePath,
            timestamp: req.timestamp
          });

          processedCount++;
        } catch (error) {
          console.error(`处理请求失败 ${req.url}:`, error);
          skippedCount++;
        }
      }

      // 添加manifest.json文件
      zip.file('manifest.json', JSON.stringify({
        generatedAt: new Date().toISOString(),
        tabId: tabId,
        totalRequests: requests.length,
        processedFiles: processedCount,
        skippedFiles: skippedCount,
        items: manifest
      }, null, 2));

      console.log(`ZIP内容准备完成: ${processedCount}个文件`);

      // 生成ZIP文件
      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      }, (metadata) => {
        console.log(`压缩进度: ${metadata.percent.toFixed(2)}%`);
      });

      console.log(`ZIP生成完成，大小: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);

      // 在Service Worker中使用FileReader将Blob转换为Data URL
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const filename = `network-capture-${timestamp}-${tabId}.zip`;

      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          const dataUrl = reader.result;

          // 使用Data URL触发下载
          chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: true
          }, (downloadId) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              console.log(`下载已启动: ${downloadId}`);
              resolve({
                downloadId,
                total: processedCount,
                skipped: skippedCount,
                size: blob.size
              });
            }
          });
        };

        reader.onerror = () => {
          reject(new Error('无法读取ZIP文件数据'));
        };

        // 读取Blob为Data URL
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('创建ZIP失败:', error);
      throw error;
    }
  }
}

// 创建全局实例
const networkCapture = new NetworkCapture();

// 监听调试器事件
chrome.debugger.onEvent.addListener((source, method, params) => {
  console.log('调试器事件:', method, '标签页:', source.tabId, '当前捕获标签页:', networkCapture.tabId);

  if (source.tabId && source.tabId === networkCapture.tabId) {
    console.log('处理网络事件:', method, params);
    networkCapture.handleNetworkEvent(method, params);
  }
});

// 处理来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'startCapture':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
          networkCapture.startCapture(tabs[0].id).then(sendResponse);
        }
      });
      return true;

    case 'stopCapture':
      networkCapture.stopCapture().then(sendResponse);
      return true;

    case 'getCaptureStatus':
      sendResponse({
        isCapturing: networkCapture.isCapturing,
        tabId: networkCapture.tabId
      });
      return true;

    case 'getAllRequests':
      const tabId = request.tabId;
      if (tabId) {
        // 如果提供了tabId，直接使用
        networkCapture.getAllRequests(tabId).then(requests => {
          sendResponse({ requests: requests || [] });
        }).catch(error => {
          console.error('获取请求失败:', error);
          sendResponse({ requests: [] });
        });
      } else {
        // 否则查询当前活动标签页
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs.length > 0) {
            networkCapture.getAllRequests(tabs[0].id).then(requests => {
              sendResponse({ requests: requests || [] });
            }).catch(error => {
              console.error('获取请求失败:', error);
              sendResponse({ requests: [] });
            });
          } else {
            sendResponse({ requests: [] });
          }
        });
      }
      return true;

    case 'clearTabData':
      const clearTabId = request.tabId;
      if (clearTabId) {
        networkCapture.clearTabRequests(clearTabId).then(() => {
          sendResponse({ success: true });
        }).catch(error => {
          console.error('清空标签页数据失败:', error);
          sendResponse({ success: false });
        });
      } else {
        sendResponse({ success: false });
      }
      return true;

    case 'openPanel':
      chrome.tabs.create({ url: chrome.runtime.getURL('panel.html') });
      sendResponse({ success: true });
      return true;

    case 'downloadZip': {
      const targetTabId = request.tabId;
      if (!targetTabId) {
        sendResponse({ success: false, message: '缺少 tabId 参数' });
        return true;
      }

      console.log(`接收到打包下载请求，标签页ID: ${targetTabId}`);

      networkCapture.createZipForTab(targetTabId)
        .then(result => {
          console.log('打包成功:', result);
          sendResponse({
            success: true,
            total: result.total,
            skipped: result.skipped,
            size: result.size,
            downloadId: result.downloadId
          });
        })
        .catch(error => {
          console.error('打包下载失败:', error);
          sendResponse({
            success: false,
            message: error.message || '打包失败，请重试'
          });
        });

      return true; // 异步响应
    }
  }
});

console.log('Network Capture Pro 后台脚本已加载');
console.log('作者：小肩膀 - 专业的网络请求分析工具');