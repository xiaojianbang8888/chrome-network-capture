class NetworkCapturePopup {
    constructor() {
        this.isCapturing = false;
        this.tabId = null;
        this.captureStartTime = null;
        this.lastElapsed = 0; // 存储最后一次捕获时长
        this.requests = [];
        this.savedFilesCount = 0;
        this.totalDataSize = 0;
        this.updateInterval = null;

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.checkCaptureStatus();
        await this.loadRecentRequests();
        this.startUpdating();
    }

    bindEvents() {
        document.getElementById('toggleCaptureBtn').addEventListener('click', () => {
            this.toggleCapture();
        });

        document.getElementById('openPanelBtn').addEventListener('click', () => {
            this.openPanel();
        });

        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearData();
        });

        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.openSettings();
        });

        document.getElementById('downloadZipBtn').addEventListener('click', () => {
            this.downloadZip();
        });
    }

    async checkCaptureStatus() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getCaptureStatus' }, (response) => {
                if (response) {
                    this.isCapturing = response.isCapturing;
                    this.tabId = response.tabId;
                    this.updateUI();
                }
                resolve();
            });
        });
    }

    async toggleCapture() {
        if (this.isCapturing) {
            // 停止捕获，但不重置计时器和数据
            const success = await this.stopCapture();
            if (success) {
                this.isCapturing = false;
                // 保留captureStartTime，这样刷新页面时可以看到累积时长
                // this.captureStartTime = null;
                this.stopUpdating();
                this.showNotification('已停止网络捕获', 'success');
            } else {
                this.showNotification('停止捕获失败', 'error');
            }
        } else {
            // 开始捕获，如果没有开始时间则设置一个
            const success = await this.startCapture();
            if (success) {
                this.isCapturing = true;
                if (!this.captureStartTime) {
                    this.captureStartTime = Date.now();
                }
                this.startUpdating();
                this.showNotification('已开始网络捕获', 'success');
            } else {
                this.showNotification('开始捕获失败', 'error');
            }
        }

        this.updateUI();
    }

    async startCapture() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'startCapture' }, (response) => {
                resolve(response && response.success !== false);
            });
        });
    }

    async stopCapture() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'stopCapture' }, (response) => {
                resolve(response && response.success !== false);
            });
        });
    }

    openPanel() {
        // 获取当前标签页ID，然后传递给面板
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                // 存储标签页ID供面板使用
                chrome.storage.local.set({
                    sourceTabId: tabs[0].id
                }, () => {
                    chrome.runtime.sendMessage({ action: 'openPanel' }, (response) => {
                        if (response && response.success) {
                            window.close();
                        }
                    });
                });
            }
        });
    }

    openSettings() {
        // 显示关于和作者信息
        this.showNotification('Network Capture Pro v1.0.0 - 作者：小肩膀', 'info');
    }

    async downloadZip() {
        try {
            // 检查是否有数据
            if (!this.requests || this.requests.length === 0) {
                this.showNotification('没有可下载的数据，请先捕获一些网络请求', 'warning');
                return;
            }

            // 获取当前标签页ID
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length === 0) {
                    this.showNotification('无法获取当前标签页', 'error');
                    return;
                }

                const tabId = tabs[0].id;
                this.showNotification('正在打包文件，请稍候...', 'info');

                // 发送打包下载请求
                chrome.runtime.sendMessage({
                    action: 'downloadZip',
                    tabId: tabId
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        this.showNotification('打包失败: ' + chrome.runtime.lastError.message, 'error');
                        return;
                    }

                    if (response && response.success) {
                        const sizeInMB = (response.size / 1024 / 1024).toFixed(2);
                        this.showNotification(
                            `打包成功！共${response.total}个文件 (${sizeInMB}MB)${response.skipped > 0 ? `，跳过${response.skipped}个` : ''}`,
                            'success'
                        );
                    } else {
                        this.showNotification(
                            response && response.message ? response.message : '打包失败，请重试',
                            'error'
                        );
                    }
                });
            });
        } catch (error) {
            console.error('打包下载失败:', error);
            this.showNotification('打包下载失败: ' + error.message, 'error');
        }
    }

    async clearData() {
        if (confirm('确定要清空所有捕获的数据吗？此操作不可撤销。')) {
            try {
                // 获取当前标签页ID
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs.length > 0) {
                        // 发送清空数据请求到background
                        chrome.runtime.sendMessage({
                            action: 'clearTabData',
                            tabId: tabs[0].id
                        }, (response) => {
                            if (response && response.success) {
                                // 清空本地数据
                                this.requests = [];
                                this.savedFilesCount = 0;
                                this.totalDataSize = 0;
                                this.updateUI();
                                this.renderRecentRequests();
                                this.showNotification('数据已清空', 'success');
                            } else {
                                this.showNotification('清空数据失败', 'error');
                            }
                        });
                    } else {
                        this.showNotification('无法获取当前标签页', 'error');
                    }
                });
            } catch (error) {
                this.showNotification('清空数据失败', 'error');
            }
        }
    }

    async loadRecentRequests() {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    chrome.runtime.sendMessage({
                        action: 'getAllRequests',
                        tabId: tabs[0].id
                    }, (response) => {
                        console.log('popup获取到的请求数据:', response);
                        if (response && response.requests) {
                            this.requests = response.requests.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                            this.calculateStats();
                            this.renderRecentRequests();
                            this.updateUI();
                        } else {
                            this.requests = [];
                            this.calculateStats();
                            this.renderRecentRequests();
                            this.updateUI();
                        }
                        resolve();
                    });
                } else {
                    this.requests = [];
                    this.calculateStats();
                    this.renderRecentRequests();
                    this.updateUI();
                    resolve();
                }
            });
        });
    }

    calculateStats() {
        this.savedFilesCount = 0;
        this.totalDataSize = 0;

        console.log('计算统计数据，请求数量:', this.requests.length);

        this.requests.forEach((request, index) => {
            console.log(`请求 ${index}:`, {
                url: request.url,
                contentType: request.contentType,
                mimeType: request.mimeType,
                responseSize: request.responseSize
            });

            if (request.responseSize) {
                this.totalDataSize += request.responseSize;
            }

            // 检查是否为已保存的文件类型
            const contentType = request.contentType;
            if (contentType && ['html', 'css', 'javascript'].includes(contentType)) {
                this.savedFilesCount++;
                console.log('找到可保存文件:', contentType, request.url);
            }
        });

        console.log('统计结果:', {
            savedFilesCount: this.savedFilesCount,
            totalDataSize: this.totalDataSize
        });
    }

    renderRecentRequests() {
        const container = document.getElementById('recentRequestsList');
        const recentRequests = this.requests.slice(0, 5); // 显示最近5个请求

        if (recentRequests.length === 0) {
            container.innerHTML = '<div class="no-requests">暂无请求</div>';
            return;
        }

        const html = recentRequests.map(request => this.createRequestItem(request)).join('');
        container.innerHTML = html;

        // 绑定点击事件
        container.querySelectorAll('.request-item').forEach(item => {
            item.addEventListener('click', () => {
                const requestId = item.dataset.requestId;
                this.openRequestDetails(requestId);
            });
        });
    }

    createRequestItem(request) {
        const url = new URL(request.url);
        const method = request.method || 'GET';
        const status = request.status || 0;
        const statusClass = this.getStatusClass(status);
        const displayUrl = `${url.hostname}${url.pathname}`;

        return `
            <div class="request-item" data-request-id="${request.requestId}">
                <div class="request-url" title="${request.url}">${displayUrl}</div>
                <div class="request-meta">
                    <span class="request-method">${method}</span>
                    <span class="request-status ${statusClass}">${status}</span>
                </div>
            </div>
        `;
    }

    getStatusClass(status) {
        if (status >= 200 && status < 300) return 'success';
        if (status >= 300 && status < 400) return 'warning';
        if (status >= 400) return 'error';
        return '';
    }

    openRequestDetails(requestId) {
        // 打开详细面板并定位到特定请求
        chrome.runtime.sendMessage({ action: 'openPanel' }, (response) => {
            if (response && response.success) {
                // 存储要查看的请求ID，面板加载后会自动显示
                chrome.storage.local.set({ selectedRequestId: requestId });
                window.close();
            }
        });
    }

    startUpdating() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        this.updateInterval = setInterval(() => {
            this.updateCaptureTime();
            this.loadRecentRequests();
        }, 1000);
    }

    stopUpdating() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    updateCaptureTime() {
        if (!this.captureStartTime) return;

        let elapsed;
        if (this.isCapturing) {
            // 如果正在捕获，计算当前时长
            elapsed = Date.now() - this.captureStartTime;
        } else {
            // 如果已停止捕获，显示最后记录的时长
            // 这里可以存储停止时间，或者保持显示最后的时长
            if (!this.lastElapsed) {
                elapsed = 0;
            } else {
                elapsed = this.lastElapsed;
            }
        }

        // 只有在正在捕获时才更新时长
        if (this.isCapturing) {
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            document.getElementById('captureTime').textContent = timeString;
            this.lastElapsed = elapsed;
        }
    }

    updateUI() {
        // 更新状态指示器
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const btnText = document.getElementById('btnText');
        const toggleBtn = document.getElementById('toggleCaptureBtn');

        if (this.isCapturing) {
            statusDot.classList.add('active');
            statusText.textContent = '正在捕获';
            btnText.textContent = '停止捕获';
            toggleBtn.classList.add('capturing');
        } else {
            statusDot.classList.remove('active');
            statusText.textContent = '未开始';
            btnText.textContent = '开始捕获';
            toggleBtn.classList.remove('capturing');
        }

        // 更新统计信息
        document.getElementById('requestCount').textContent = this.requests.length;
        document.getElementById('savedFilesCount').textContent = this.savedFilesCount;
        document.getElementById('dataSize').textContent = this.formatSize(this.totalDataSize);

        // 更新时长显示
        if (!this.isCapturing && this.lastElapsed > 0) {
            const minutes = Math.floor(this.lastElapsed / 60000);
            const seconds = Math.floor((this.lastElapsed % 60000) / 1000);
            const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            document.getElementById('captureTime').textContent = timeString;
        } else if (!this.isCapturing) {
            document.getElementById('captureTime').textContent = '00:00';
        }
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    showNotification(message, type = 'info') {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        // 添加样式
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-size: 14px;
            font-weight: 600;
            z-index: 10000;
            max-width: 300px;
            word-wrap: break-word;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideInRight 0.3s ease-out;
        `;

        // 设置背景颜色
        switch (type) {
            case 'success':
                notification.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
                break;
            case 'error':
                notification.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
                break;
            case 'warning':
                notification.style.background = 'linear-gradient(135deg, #ffc107 0%, #ff9800 100%)';
                break;
            default:
                notification.style.background = 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)';
        }

        // 添加到页面
        document.body.appendChild(notification);

        // 自动移除
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// 初始化弹窗
document.addEventListener('DOMContentLoaded', () => {
    new NetworkCapturePopup();
});