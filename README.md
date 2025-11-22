# Network Capture Pro - Chrome扩展

一个强大的Chrome浏览器扩展，用于捕获、分析和保存网络请求数据。

## 主要功能

### 1. 网络请求捕获
- 使用Chrome DevTools Protocol捕获所有HTTP/HTTPS请求
- 实时捕获请求头、响应头、响应体等完整信息
- 支持所有HTTP方法（GET、POST、PUT、DELETE等）
- 自动保存到IndexedDB数据库

### 2. 智能文件保存
- 自动识别HTML、CSS、JavaScript文件
- 按域名和路径结构保存到本地
- 支持图片、字体等其他资源文件
- 保持网站原始目录结构

### 3. 数据分析面板
- 详细的请求列表展示
- 支持多维度过滤（URL、类型、状态码、方法）
- 实时统计分析（请求数量、数据量、文件类型分布）
- 响应体内容预览（HTML、CSS、JSON等）

### 4. 数据管理
- 导出JSON格式的完整数据
- 清空历史数据
- 持久化存储，重启浏览器后数据不丢失

## 安装方法

### 方法一：开发者模式安装（推荐）

1. **下载项目文件**
   ```
   git clone https://github.com/your-repo/chrome-network-capture.git
   # 或者直接下载ZIP文件并解压
   ```

2. **打开Chrome扩展管理页面**
   - 在地址栏输入：`chrome://extensions/`
   - 或者：菜单 → 更多工具 → 扩展程序

3. **启用开发者模式**
   - 点击右上角的"开发者模式"开关

4. **加载扩展**
   - 点击"加载已解压的扩展程序"
   - 选择项目文件夹 `chrome-network-capture`

5. **验证安装**
   - 扩展图标应该出现在浏览器工具栏
   - 点击图标可以打开控制面板

### 方法二：打包安装

1. 在开发者模式下，点击"打包扩展程序"
2. 选择项目文件夹生成.crx文件
3. 双击.crx文件或拖拽到扩展页面安装

## 使用指南

### 基本操作

#### 1. 开始捕获
```
1. 打开要监控的网页
2. 点击扩展图标
3. 点击"开始捕获"按钮
4. 状态指示器变绿表示正在捕获
```

#### 2. 查看数据
```
1. 点击"查看详情"按钮打开分析面板
2. 在面板中查看所有捕获的请求
3. 使用过滤器快速定位特定请求
```

#### 3. 导出数据
```
1. 在分析面板中点击"导出数据"
2. 选择保存位置
3. 数据将保存为JSON格式
```

### 高级功能

#### 请求过滤
- **URL搜索**：输入关键词过滤特定URL
- **类型过滤**：选择HTML、CSS、JS、图片等类型
- **状态过滤**：按HTTP状态码筛选（2xx、3xx、4xx、5xx）
- **方法过滤**：按HTTP方法筛选（GET、POST等）

#### 文件保存规则
- HTML文件：保存为 `.html`
- CSS文件：保存为 `.css`
- JavaScript文件：保存为 `.js`
- 图片文件：保持原始格式
- 保存路径：`域名/原始路径/文件名`

#### 数据分析
- **实时统计**：显示总请求数、各类型文件数量
- **数据量统计**：计算下载的数据总量
- **捕获时长**：记录捕获活动的时间

## 技术实现

### 架构设计
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Popup.html    │    │  Background.js  │    │   Panel.html    │
│   (控制界面)     │◄──►│   (核心逻辑)     │◄──►│   (分析面板)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  IndexedDB      │
                    │   (数据存储)     │
                    └─────────────────┘
```

### 核心技术
- **Chrome DevTools Protocol**：网络请求捕获
- **IndexedDB**：客户端数据持久化
- **Chrome Downloads API**：文件本地保存
- **Service Worker**：后台任务处理

### 数据库结构
```sql
-- networkRequests 表
{
  requestId: string,        // 请求唯一标识
  tabId: number,           // 标签页ID
  url: string,             // 请求URL
  method: string,          // HTTP方法
  status: number,          // HTTP状态码
  requestHeaders: object,  // 请求头
  responseHeaders: object, // 响应头
  responseBody: string,    // 响应体
  contentType: string,     // 内容类型
  timestamp: number,       // 时间戳
  responseSize: number     // 响应大小
}

-- savedFiles 表
{
  fileId: string,          // 文件ID
  requestId: string,       // 关联的请求ID
  url: string,             // 原始URL
  domain: string,          // 域名
  filename: string,        // 保存的文件名
  savedAt: string          // 保存时间
}
```

## 权限说明

扩展需要以下权限：

- **debugger**：使用DevTools Protocol进行网络捕获
- **activeTab**：访问当前活动标签页
- **storage**：本地数据存储
- **downloads**：文件下载和保存
- **<all_urls>**：访问所有网站的网络请求

## 安全说明

- 所有数据仅在本地存储，不会上传到任何服务器
- 扩展仅在用户主动启动时才开始捕获
- 敏感信息（如密码、token）会被捕获，请注意数据安全
- 建议仅在开发和测试环境中使用

## 故障排除

### 常见问题

#### 1. 无法开始捕获
- **原因**：权限不足或扩展未正确加载
- **解决**：重新安装扩展，确保所有权限已授予

#### 2. 捕获的数据不完整
- **原因**：网页使用了Service Worker或特殊协议
- **解决**：刷新页面重新开始捕获

#### 3. 文件保存失败
- **原因**：Chrome下载权限或磁盘空间不足
- **解决**：检查Chrome下载设置和磁盘空间

#### 4. 扩展图标不显示
- **原因**：扩展被禁用或安装失败
- **解决**：在扩展管理页面重新启用

### 调试方法

1. **查看控制台日志**
   ```
   右键点击扩展图标 → 检查弹出内容
   在分析页面按F12打开开发者工具
   ```

2. **检查后台脚本**
   ```
   chrome://extensions/ → 扩展详情 → 检查视图：Service Worker
   ```

## 更新日志

### v1.0.0 (2024-01-20)
- 初始版本发布
- 基础网络捕获功能
- 文件自动保存
- 数据分析面板

## 开发计划

- [ ] 支持WebSocket连接捕获
- [ ] 添加请求重放功能
- [ ] 支持更多文件格式预览
- [ ] 添加数据可视化图表
- [ ] 支持批量导出和导入

## 贡献指南

欢迎提交Issue和Pull Request！

### 开发环境设置
```bash
# 克隆项目
git clone https://github.com/your-repo/chrome-network-capture.git

# 进入项目目录
cd chrome-network-capture

# 开始开发（直接加载到Chrome即可）
```

### 提交规范
- feat: 新功能
- fix: 修复bug
- docs: 文档更新
- style: 代码格式调整
- refactor: 代码重构

## 联系方式

- GitHub Issues: https://github.com/your-repo/chrome-network-capture/issues
- 微信: xiaojianbang8888
- QQ: 24358757
- QQ: 285092564

---

**注意**：此工具仅用于合法的网络分析和调试目的，请遵守相关法律法规和网站使用条款。