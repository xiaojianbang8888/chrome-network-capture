class NetworkCapturePanel {
    constructor() {
        this.requests = [];
        this.filteredRequests = [];
        this.selectedRequest = null;
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadRequests();
        this.renderRequests();
        this.updateStats();
    }

    bindEvents() {
        // 工具栏事件
        document.getElementById('refreshBtn').addEventListener('click', () => this.refresh());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearData());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
        document.getElementById('downloadZipBtn').addEventListener('click', () => this.downloadZip());

        // 过滤器事件
        document.getElementById('searchInput').addEventListener('input', () => this.filterRequests());
        document.getElementById('typeFilter').addEventListener('change', () => this.filterRequests());
        document.getElementById('statusFilter').addEventListener('change', () => this.filterRequests());
        document.getElementById('methodFilter').addEventListener('change', () => this.filterRequests());

        // 模态框事件
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.querySelector('.modal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeModal();
        });

        // 标签页事件
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
    }

    async loadRequests() {
        return new Promise((resolve) => {
            // 首先尝试从存储中获取源标签页ID
            chrome.storage.local.get(['sourceTabId'], (result) => {
                const sourceTabId = result.sourceTabId;

                if (sourceTabId) {
                    console.log('使用存储的源标签页ID:', sourceTabId);
                    chrome.runtime.sendMessage({
                        action: 'getAllRequests',
                        tabId: sourceTabId
                    }, (response) => {
                        console.log('面板获取到的请求数据:', response);
                        if (response && response.requests) {
                            this.requests = response.requests.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                            this.filteredRequests = [...this.requests];
                        } else {
                            this.requests = [];
                            this.filteredRequests = [];
                        }
                        resolve();
                    });
                } else {
                    // 如果没有存储的ID，尝试获取当前标签页（回退方案）
                    console.log('没有存储的源标签页ID，使用当前标签页');
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs.length > 0) {
                            chrome.runtime.sendMessage({
                                action: 'getAllRequests',
                                tabId: tabs[0].id
                            }, (response) => {
                                console.log('面板获取到的请求数据（回退）:', response);
                                if (response && response.requests) {
                                    this.requests = response.requests.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                                    this.filteredRequests = [...this.requests];
                                } else {
                                    this.requests = [];
                                    this.filteredRequests = [];
                                }
                                resolve();
                            });
                        } else {
                            this.requests = [];
                            this.filteredRequests = [];
                            resolve();
                        }
                    });
                }
            });
        });
    }

    renderRequests() {
        const listBody = document.getElementById('requestListBody');

        if (this.filteredRequests.length === 0) {
            listBody.innerHTML = '<div class="loading">没有找到请求</div>';
            return;
        }

        const html = this.filteredRequests.map(request => this.createRequestRow(request)).join('');
        listBody.innerHTML = html;

        // 绑定行点击事件
        listBody.querySelectorAll('.request-row').forEach(row => {
            row.addEventListener('click', () => {
                const requestId = row.dataset.requestId;
                this.selectRequest(requestId);
            });
        });
    }

    createRequestRow(request) {
        const method = request.method || 'GET';
        const status = request.status || 0;
        const url = new URL(request.url);
        const contentType = request.contentType || 'unknown';
        const size = this.formatSize(request.responseSize || 0);
        const time = new Date(request.timestamp * 1000).toLocaleTimeString();

        const statusClass = this.getStatusClass(status);
        const statusBadge = `<span class="status-badge ${statusClass}">${status}</span>`;

        return `
            <div class="request-row" data-request-id="${request.requestId}">
                <table>
                    <tr>
                        <td style="width: 150px;">
                            <div class="method-cell ${method}">${method}</div>
                        </td>
                        <td style="width: 300px;">
                            <div class="status-cell">
                                ${statusBadge}
                                <span class="status-text">${this.getStatusText(status)}</span>
                            </div>
                        </td>
                        <td>
                            <div class="url-cell" title="${request.url}">
                                ${url.hostname}${url.pathname}
                            </div>
                        </td>
                        <td style="width: 120px;">
                            <div class="type-cell">${contentType}</div>
                        </td>
                        <td style="width: 150px;">
                            <div class="size-cell">${size}</div>
                        </td>
                        <td style="width: 120px;">
                            <div class="time-cell">${time}</div>
                        </td>
                    </tr>
                </table>
            </div>
        `;
    }

    getStatusClass(status) {
        if (status >= 200 && status < 300) return 'success';
        if (status >= 300 && status < 400) return 'warning';
        if (status >= 400) return 'error';
        return '';
    }

    getStatusText(status) {
        if (status >= 200 && status < 300) return '成功';
        if (status >= 300 && status < 400) return '重定向';
        if (status >= 400 && status < 500) return '客户端错误';
        if (status >= 500) return '服务器错误';
        return '未知';
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    selectRequest(requestId) {
        // 移除之前的选中状态
        document.querySelectorAll('.request-row').forEach(row => {
            row.classList.remove('selected');
        });

        // 添加新的选中状态
        const selectedRow = document.querySelector(`[data-request-id="${requestId}"]`);
        if (selectedRow) {
            selectedRow.classList.add('selected');
        }

        // 获取请求数据
        this.selectedRequest = this.requests.find(req => req.requestId === requestId);
        if (this.selectedRequest) {
            this.showRequestDetails(this.selectedRequest);
        }
    }

    showRequestDetails(request) {
        const detailsDiv = document.getElementById('requestDetails');

        const detailsHtml = `
            <div class="request-info">
                <h3>请求信息</h3>
                <div class="info-row">
                    <strong>URL:</strong>
                    <div class="url-info">${request.url}</div>
                </div>
                <div class="info-row">
                    <strong>方法:</strong> ${request.method}
                </div>
                <div class="info-row">
                    <strong>状态:</strong> ${request.status} ${this.getStatusText(request.status)}
                </div>
                <div class="info-row">
                    <strong>类型:</strong> ${request.contentType}
                </div>
                <div class="info-row">
                    <strong>大小:</strong> ${this.formatSize(request.responseSize || 0)}
                </div>
                <div class="info-row">
                    <strong>时间:</strong> ${new Date(request.timestamp * 1000).toLocaleString()}
                </div>
            </div>
            <button class="btn btn-primary" id="viewDetailsBtn">
                查看完整详情
            </button>
        `;

        detailsDiv.innerHTML = detailsHtml;

        // 添加事件监听器到动态创建的按钮
        const viewDetailsBtn = document.getElementById('viewDetailsBtn');
        if (viewDetailsBtn) {
            viewDetailsBtn.addEventListener('click', () => this.showModal());
        }
    }

    showModal() {
        if (!this.selectedRequest) return;

        const modal = document.getElementById('detailModal');
        document.getElementById('modalTitle').textContent = `请求详情 - ${this.selectedRequest.url}`;

        // 显示请求头
        this.displayHeaders('requestHeaders', {
            'URL': this.selectedRequest.url,
            '方法': this.selectedRequest.method,
            '类型': this.selectedRequest.contentType,
            '大小': this.formatSize(this.selectedRequest.responseSize || 0)
        });

        // 显示响应头
        this.displayHeaders('responseHeaders', {
            '状态': `${this.selectedRequest.status} ${this.getStatusText(this.selectedRequest.status)}`,
            'MIME类型': this.selectedRequest.mimeType,
            '时间': new Date(this.selectedRequest.timestamp * 1000).toLocaleString()
        });

        // 显示响应体
        this.displayResponseBody();

        // 显示预览
        this.displayPreview();

        modal.style.display = 'block';
        this.switchTab('headers');
    }

    closeModal() {
        document.getElementById('detailModal').style.display = 'none';
    }

    switchTab(tabName) {
        // 切换标签按钮状态
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // 切换内容显示
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}Content`).classList.add('active');
    }

    displayHeaders(containerId, headers) {
        const container = document.getElementById(containerId);
        const html = Object.entries(headers).map(([key, value]) => `
            <div class="header-item">
                <div class="header-name">${key}:</div>
                <div class="header-value">${value}</div>
            </div>
        `).join('');
        container.innerHTML = html;
    }

    displayResponseBody() {
        const container = document.getElementById('responseBody');
        if (!this.selectedRequest.responseBody) {
            container.textContent = '无响应体内容';
            return;
        }

        let content;
        if (this.selectedRequest.base64Encoded) {
            try {
                content = atob(this.selectedRequest.responseBody);
            } catch (e) {
                content = '[Base64编码内容无法显示]';
            }
        } else {
            content = this.selectedRequest.responseBody;
        }

        // 格式化JSON
        if (this.selectedRequest.contentType === 'json') {
            try {
                const parsed = JSON.parse(content);
                content = JSON.stringify(parsed, null, 2);
            } catch (e) {
                // 不是有效的JSON，保持原样
            }
        }

        container.textContent = content;
    }

    // 转义HTML特殊字符，防止XSS攻击
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    displayPreview() {
        const container = document.getElementById('contentPreview');
        if (!this.selectedRequest.responseBody) {
            container.innerHTML = '<p>无内容预览</p>';
            return;
        }

        let content;
        if (this.selectedRequest.base64Encoded) {
            try {
                content = atob(this.selectedRequest.responseBody);
            } catch (e) {
                container.innerHTML = '<p>无法解码Base64内容</p>';
                return;
            }
        } else {
            content = this.selectedRequest.responseBody;
        }

        // 根据内容类型显示预览
        if (this.selectedRequest.contentType === 'html') {
            // 使用sandbox属性隔离iframe，防止恶意脚本执行
            // allow-same-origin 允许访问同源内容，但不允许脚本执行
            container.innerHTML = `
                <div class="preview-warning">
                    <strong>HTML预览 (沙盒环境 - 脚本已禁用):</strong>
                </div>
                <iframe sandbox="allow-same-origin" srcdoc="${this.escapeHtml(content)}"></iframe>
            `;
        } else if (this.selectedRequest.contentType === 'css') {
            container.innerHTML = `
                <div class="preview-warning">
                    <strong>CSS预览:</strong>
                </div>
                <style>${content}</style>
                <div class="css-preview">
                    <h2>样式预览</h2>
                    <p class="sample-text">这是示例文本</p>
                    <button class="sample-btn">示例按钮</button>
                </div>
            `;
        } else if (this.selectedRequest.contentType === 'json') {
            try {
                const parsed = JSON.parse(content);
                container.innerHTML = `
                    <div class="preview-warning">
                        <strong>JSON预览:</strong>
                    </div>
                    <pre>${JSON.stringify(parsed, null, 2)}</pre>
                `;
            } catch (e) {
                container.innerHTML = `<pre>${content}</pre>`;
            }
        } else if (this.selectedRequest.contentType === 'image') {
            const mimeType = this.selectedRequest.mimeType || 'image/png';
            const base64Content = this.selectedRequest.base64Encoded ?
                this.selectedRequest.responseBody :
                btoa(content);

            container.innerHTML = `
                <div class="preview-warning">
                    <strong>图片预览:</strong>
                </div>
                <img src="data:${mimeType};base64,${base64Content}" alt="预览图片" style="max-width: 100%; height: auto;">
            `;
        } else {
            container.innerHTML = `<pre>${content.substring(0, 10000)}${content.length > 10000 ? '\\n\\n[内容已截断...]' : ''}</pre>`;
        }
    }

    filterRequests() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const typeFilter = document.getElementById('typeFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;
        const methodFilter = document.getElementById('methodFilter').value;

        this.filteredRequests = this.requests.filter(request => {
            // 搜索过滤
            if (searchTerm && !request.url.toLowerCase().includes(searchTerm)) {
                return false;
            }

            // 类型过滤
            if (typeFilter && request.contentType !== typeFilter) {
                return false;
            }

            // 状态过滤
            if (statusFilter) {
                const status = request.status || 0;
                if (statusFilter === '2xx' && (status < 200 || status >= 300)) return false;
                if (statusFilter === '3xx' && (status < 300 || status >= 400)) return false;
                if (statusFilter === '4xx' && (status < 400 || status >= 500)) return false;
                if (statusFilter === '5xx' && (status < 500 || status >= 600)) return false;
            }

            // 方法过滤
            if (methodFilter && request.method !== methodFilter) {
                return false;
            }

            return true;
        });

        this.renderRequests();
    }

    updateStats() {
        const stats = {
            total: this.requests.length,
            html: 0,
            css: 0,
            javascript: 0,
            image: 0,
            other: 0
        };

        this.requests.forEach(request => {
            const type = request.contentType || 'other';
            if (stats.hasOwnProperty(type)) {
                stats[type]++;
            } else {
                stats.other++;
            }
        });

        document.getElementById('totalRequests').textContent = stats.total;
        document.getElementById('htmlCount').textContent = stats.html;
        document.getElementById('cssCount').textContent = stats.css;
        document.getElementById('jsCount').textContent = stats.javascript;
        document.getElementById('imageCount').textContent = stats.image;
        document.getElementById('otherCount').textContent = stats.other;
    }

    async refresh() {
        await this.loadRequests();
        this.filterRequests();
        this.updateStats();
    }

    async clearData() {
        if (confirm('确定要清空所有捕获的数据吗？此操作不可撤销。')) {
            // 清空数据库
            const request = indexedDB.deleteDatabase('NetworkCaptureDB');
            request.onsuccess = () => {
                this.requests = [];
                this.filteredRequests = [];
                this.renderRequests();
                this.updateStats();
                alert('数据已清空');
            };
        }
    }

    async exportData() {
        if (this.requests.length === 0) {
            alert('没有数据可以导出');
            return;
        }

        const exportData = {
            timestamp: new Date().toISOString(),
            totalRequests: this.requests.length,
            requests: this.requests
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `network-capture-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);
    }

    async downloadZip() {
        if (this.requests.length === 0) {
            alert('没有数据可以打包下载');
            return;
        }

        try {
            // 获取sourceTabId
            const sourceTabId = await new Promise((resolve) => {
                chrome.storage.local.get(['sourceTabId'], (result) => {
                    resolve(result.sourceTabId);
                });
            });

            // 如果没有sourceTabId，尝试使用当前活动标签页
            const tabIdToUse = sourceTabId || await new Promise((resolve) => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    resolve(tabs[0] && tabs[0].id);
                });
            });

            if (!tabIdToUse) {
                alert('无法获取目标标签页ID，请确保有活动的捕获会话');
                return;
            }

            // 显示进度提示
            const originalText = document.getElementById('downloadZipBtn').textContent;
            document.getElementById('downloadZipBtn').textContent = '打包中...';
            document.getElementById('downloadZipBtn').disabled = true;

            // 发送打包请求
            chrome.runtime.sendMessage({
                action: 'downloadZip',
                tabId: tabIdToUse
            }, (response) => {
                // 恢复按钮状态
                document.getElementById('downloadZipBtn').textContent = originalText;
                document.getElementById('downloadZipBtn').disabled = false;

                if (chrome.runtime.lastError) {
                    alert('打包失败: ' + chrome.runtime.lastError.message);
                    return;
                }

                if (response && response.success) {
                    const sizeInMB = (response.size / 1024 / 1024).toFixed(2);
                    const message = `打包成功！\n文件数: ${response.total}\n大小: ${sizeInMB}MB${response.skipped > 0 ? `\n跳过: ${response.skipped}个` : ''}`;
                    alert(message);
                } else {
                    alert(response && response.message ? response.message : '打包失败，请重试');
                }
            });
        } catch (error) {
            console.error('打包下载失败:', error);
            alert('打包下载失败: ' + error.message);
            // 恢复按钮状态
            document.getElementById('downloadZipBtn').textContent = '打包下载';
            document.getElementById('downloadZipBtn').disabled = false;
        }
    }
}

// 初始化面板
const networkCapturePanel = new NetworkCapturePanel();
console.log('Network Capture Pro 面板已加载 - 作者：小肩膀');