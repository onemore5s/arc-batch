// Chinese strings are stable translation keys; never translate user data, wallet brands, or protocol fields.
export const EN_MESSAGES: Record<string, string> = {
  "ArcBatch · 社区奖励发放": "ArcBatch · Batch USDC payments",
  语言: "Language",
  "尚未配置合约部署清单，付款暂不可用":
    "No contract deployment configured. Payments are unavailable.",
  "请先完成名单校验、部署配置与钱包连接":
    "Validate the recipients, configure the deployment, and connect a wallet first.",
  "同一名单有结果待核验的批次，请到发放记录继续查询，不能创建新 ID 绕过核验":
    "This recipient list has a batch awaiting verification. Check its result in History before creating another batch.",
  "相同名单已有历史批次。创建新批次会再次发奖，请确认已经核对历史结果。":
    "This recipient list has been used before. A new batch will pay these recipients again. Continue only after checking the previous result.",
  请重新复核付款信息: "Please review the payment details again.",
  请连接原付款钱包并切换到该批次网络与合约:
    "Connect the original payer wallet and select this batch’s network and contract.",
  "沿用原批次 ID 和冻结名单重试。原交易与重试交易可能都产生手续费，但合约最多完成一次发奖。":
    "Retry with the original batch ID and saved recipients. Both transactions may incur fees, but the contract can complete this batch only once.",
  文件超过大小上限: "The file exceeds the size limit.",
  需要有效部署清单才能从交易恢复:
    "A verified deployment is required to restore a transaction.",
  连接钱包后复核奖励: "Connect a wallet to review payments",
  请将钱包切换到目标网络: "Switch your wallet to the selected network",
  修正名单后即可复核: "Correct the recipient list to continue",
  完善收款名单后即可复核: "Complete the recipient list to continue",
  请输入收款地址: "Enter a recipient address",
  请输入金额: "Enter an amount",
  主导航: "Main navigation",
  批量发放: "Send",
  发放记录: "History",
  使用说明: "Guide",
  目标网络: "Target network",
  切换钱包: "Manage wallet",
  连接钱包: "Connect wallet",
  "连接中…": "Connecting…",
  "批量发放 USDC": "Send USDC in batches",
  "导入收款名单，核对后通过钱包付款。":
    "Add recipients, review the details, and pay with your wallet.",
  "查看批次进度、核验交易并导出记录。":
    "Track batches, verify transactions, and export your records.",
  "了解名单格式、付款流程和记录恢复。":
    "Learn about recipient lists, payments, and restoring records.",
  "名单可先整理；正式付款需要核验部署配置。":
    "You can prepare recipients now. Payments require a verified deployment.",
  关闭错误提示: "Dismiss error",
  钱包当前网络与目标网络不一致:
    "Your wallet is connected to a different network.",
  "切换钱包到 {network}": "Switch wallet to {network}",
  活动名称: "Batch name",
  "选填 · 仅保存在本地": "Optional · Saved locally",
  "例如：活动名称": "Give this batch a name",
  收款名单: "Recipients",
  "导入 CSV": "Import CSV",
  下载模板: "Download template",
  "CSV 格式示例": "CSV format example",
  "将模板中的占位内容替换为收款信息后再导入。":
    "Replace the template placeholders with recipient details before importing.",
  粘贴名单: "Paste list",
  手动添加: "Add recipient",
  粘贴地址与金额: "Paste addresses and amounts",
  "每行一个钱包地址和金额，用空格或制表符分隔。":
    "One wallet address and amount per line, separated by a space or tab.",
  "钱包地址　奖励金额": "Wallet address   Amount",
  导入粘贴内容: "Import list",
  行: "Row",
  序号: "Row number",
  清空名单: "Clear all",
  撤销: "Undo",
  "已清空 {count} 行": "Cleared {count} rows",
  收款地址: "Recipient address",
  "金额 / USDC": "Amount / USDC",
  标签: "Label",
  选填: "Optional",
  操作: "Actions",
  "第 {row} 行地址": "Row {row} address",
  "输入钱包地址 0x…": "Wallet address 0x…",
  "第 {row} 行金额": "Row {row} amount",
  填写金额: "Amount",
  "标签 · 选填": "Label · Optional",
  "第 {row} 行标签": "Row {row} label",
  添加备注: "Add a note",
  "删除第 {row} 行": "Delete row {row}",
  尚未添加收款人: "No recipients yet",
  "导入 CSV，或直接粘贴钱包地址与奖励金额。":
    "Import a CSV or paste wallet addresses and amounts.",
  "必填列 address、amount · 可选列 label":
    "Required: address, amount · Optional: label",
  "最多 6 位小数，重复地址会阻止整个批次。":
    "Up to 6 decimal places. Duplicate addresses block the entire batch.",
  确认付款信息: "Review payment",
  付款概览: "Payment overview",
  交易详情: "Transaction details",
  "连接后可复核名单，付款前还需你确认":
    "Connect to review your recipients. You’ll confirm before paying.",
  "{count} 位收款人": "{count} recipients",
  付款钱包: "Payer wallet",
  发放网络: "Network",
  发奖合约: "Payment contract",
  "批次 ID": "Batch ID",
  "任一收款失败，本批奖励全部回滚；失败交易仍可能产生手续费。":
    "If any transfer fails, the entire batch is reverted. Failed transactions may still incur fees.",
  调用和全部事件已匹配: "Transaction and all events verified",
  重新预检原快照: "Check payment again",
  继续查询: "Check status",
  明确重试原批次: "Retry this batch",
  重新整理名单: "Start over",
  发放合计: "Total amount",
  发放下一批: "Send another batch",
  导出发放报告: "Export report",
  "正在处理…": "Processing…",
  确认并在钱包中付款: "Confirm in wallet",
  复核奖励: "Review payments",
  "本批记录已保存，可继续整理下一批名单":
    "Batch saved. You can prepare your next payment.",
  "确认前会再次检查钱包、余额并模拟交易":
    "Your wallet, balance, and transaction will be checked again before payment.",
  "付款快照已保存，名单已冻结":
    "Payment details saved. Recipients are locked for this batch.",
  下一步查看完整执行名单与手续费: "Next: review all recipients and fees",
  余额与手续费: "Balance and fees",
  付款方式: "Payment method",
  "原生 USDC · 单笔交易": "Native USDC · One transaction",
  钱包余额: "Wallet balance",
  连接后查询: "Connect to view",
  预计手续费: "Estimated fee",
  预检后计算: "Calculated during review",
  保守准备额度: "Required balance",
  "奖励 + gas 上限": "Payments + gas limit",
  实际手续费: "Actual fee",
  "通过钱包确认付款，无平台手续费。":
    "Confirm in your wallet. No platform fees.",
  了解发放规则: "How payments work",
  本地批次: "Saved batches",
  备份全部记录: "Back up all records",
  "恢复 JSON 备份": "Restore JSON backup",
  "记录保存在当前浏览器，按网络、合约与付款钱包隔离。备份恢复后重新核验链上结果。":
    "Records are saved in this browser by network, contract, and payer wallet. Restored backups must be verified onchain again.",
  从交易哈希恢复: "Restore from transaction hash",
  "完整交易哈希 0x…": "Full transaction hash 0x…",
  核验交易: "Verify transaction",
  还没有发放记录: "No batches yet",
  "准备第一批奖励后，冻结快照与交易进度会保存在这里。":
    "Once you prepare a batch, its saved payment details and progress will appear here.",
  去整理名单: "Prepare recipients",
  本地发放记录: "Saved payment history",
  奖励批次: "Batch",
  发放金额: "Amount",
  网络与钱包: "Network and wallet",
  状态: "Status",
  未命名奖励: "Untitled batch",
  合约地址: "Contract address",
  查看批次: "View batch",
  "导出 CSV": "Export CSV",
  发放流程: "Payment progress",
  整理: "Prepare",
  "CSV 包含 address、amount，可选 label。金额使用普通十进制，最多 6 位小数。重复、错误地址或金额会阻止整批付款。":
    "CSV files need address and amount columns, with an optional label. Use decimal amounts with up to 6 decimal places. Duplicate or invalid addresses and amounts block the whole batch.",
  "连接钱包并切换到目标 Arc 网络。逐个核对执行名单、付款人、总额和手续费。余额须覆盖奖励与 gas。":
    "Connect your wallet and switch to the target Arc network. Review each recipient, the payer, total amount, and fees. Your balance must cover the payments and gas.",
  复核: "Review",
  发放: "Send",
  "付款前保存原批次 ID 和冻结名单。同一付款钱包的同一 ID 最多成功一次，任何收款失败整笔回滚。失败仍可能消耗 gas。":
    "The batch ID and recipient list are saved before payment. Each ID can succeed only once per payer wallet. If any transfer fails, the entire transaction reverts. Failed transactions may still use gas.",
  核验: "Verify",
  "查询超时不表示失败。通过原网络继续查询或输入交易哈希恢复，只有实际调用与所有事件匹配才确认已发放。":
    "A timeout does not mean failure. Check again on the original network or restore using the transaction hash. A batch is marked paid only after its transaction and all events match.",
  "请始终通过应用发奖。合约拒绝直接转入；其他协议行为产生的意外余额没有管理员恢复入口。当前实现未经独立安全审计。":
    "Always send payments through the app. The contract rejects direct transfers and has no admin recovery for funds received through other protocol behavior. This implementation has not had an independent security audit.",
  "本地标签与活动名不会写入链上，请定期导出 JSON 备份。钱包切换后，已提交批次仍通过原网络查询。重试沿用原 ID，两笔交易可能都产生手续费。":
    "Labels and batch names stay local. Export JSON backups regularly. Submitted batches are checked on their original network even after switching wallets. Retries use the original ID, and both transactions may incur fees.",
  "查看 Arc 原生 USDC 官方说明 ↗": "Read the Arc native USDC documentation ↗",
  "钱包签名 · 链上发放 · 本地记录":
    "Wallet signed · Onchain payments · Local records",
  记录使用不支持的网络: "This record uses an unsupported network.",
  "查看交易 {hash} ↗": "View transaction {hash} ↗",
  "替换原因 {reason}：{oldHash} → {newHash}":
    "Replacement ({reason}): {oldHash} → {newHash}",
  "付款尝试记录（{count} 次）": "Payment attempts ({count})",
  "每次钱包请求独立记录，批次结果以上方核验状态为准。":
    "Each wallet request is recorded separately. The verified batch status above is the final result.",
  "第 {count} 次尝试": "Attempt {count}",
  "查看此次交易 {hash} ↗": "View this transaction {hash} ↗",
  "复制 {value}": "Copy {value}",
  复制: "Copy",
  已复制: "Copied",
  复制失败: "Copy failed",
  "复制失败，请手动复制": "Copy failed. Please copy the value manually.",
  "复制{label} {value}": "Copy {label} {value}",
  "复制{label}": "Copy {label}",
  本次发放结果: "Payment result",
  发放完成: "Payment complete",
  "已发放至 {count} 位收款人": "sent to {count} recipients",
  "新名单已准备好，可以继续导入下一批。":
    "Ready for your next batch. Add a new recipient list below.",
  查看本次详情: "View details",
  导出报告: "Export report",
  关闭发放结果: "Dismiss payment result",
  付款检查: "Payment check",
  钱包签名: "Wallet signature",
  链上确认: "Confirm",
  等待操作: "Awaiting action",
  处理中: "In progress",
  需要核验: "Needs verification",
  未完成: "Incomplete",
  已完成: "Complete",
  需要检查付款条件: "Payment check required",
  "请检查付款钱包、网络及余额后继续。":
    "Check your payer wallet, network, and balance to continue.",
  正在检查付款条件: "Checking payment details",
  "正在核对钱包、网络、余额与预计手续费。":
    "Checking your wallet, network, balance, and estimated fees.",
  等待你确认付款: "Ready for your confirmation",
  "核对下方名单与金额，然后发起钱包签名。":
    "Review the recipients and amounts below, then confirm in your wallet.",
  请在钱包中确认: "Confirm in your wallet",
  "签名请求已发出，请打开钱包核对并确认这笔交易。":
    "Open your wallet to review and confirm the transaction.",
  等待链上回执: "Waiting for confirmation",
  "交易已提交，正在等待确认并核验每位收款人的发放结果。":
    "Transaction submitted. Waiting for confirmation and verifying every recipient’s payment.",
  签名结果待核验: "Signature needs verification",
  "尚未获得交易哈希，请继续查询，核验结果后再决定是否重试。":
    "No transaction hash received yet. Check the result before deciding whether to retry.",
  发放结果待核验: "Payment needs verification",
  "尚未取得完整的链上证据，请继续查询这笔交易。":
    "Complete onchain evidence is not available yet. Check this transaction again.",
  交易已回滚: "Transaction reverted",
  "本批奖励未发放，仍可能产生手续费。核验后可重试原批次。":
    "This batch was not paid. Fees may still apply. Verify the result before retrying the original batch.",
  交易已取消: "Transaction cancelled",
  "本次交易未完成发放，核验后可重试原批次。":
    "This transaction did not complete the payments. Verify the result before retrying the original batch.",
  "签名已取消，可重新确认": "Signature cancelled. You can try again.",
  "本次签名请求未提交交易，重新检查付款条件后可以再次发起。":
    "No transaction was submitted for this request. Check the payment details before trying again.",
  全部收款事件已核验: "All payments verified",
  "本批奖励发放完成，可在下方查看交易或导出发放报告。":
    "All payments are complete. View the transaction or export a report below.",
  收款名单已保存: "Recipient list saved",
  付款条件已检查: "Payment details checked",
  签名请求已发起: "Signature requested",
  交易已提交至网络: "Transaction submitted to network",
  交易回执与全部事件匹配: "Receipt and all events verified",
  "{count} 个步骤": "{count} steps",
  本批次: "Batch",
  付款步骤: "Payment steps",
  进行中: "In progress",
  待处理: "Needs attention",
  待操作: "Awaiting action",
  未开始: "Not started",
  执行记录: "Activity",
  本次付款尝试: "Current attempt",
  名单准备就绪: "Recipients ready",
  发放执行记录: "Payment activity",
  暂无选项: "No options",
  "{label}选项": "{label} options",
  "{name} 图标": "{name} icon",
  关闭钱包选择: "Close wallet selection",
  搜索钱包: "Search wallets",
  "搜索钱包…": "Search wallets…",
  清除搜索: "Clear search",
  可用钱包: "Available wallets",
  连接中: "Connecting",
  已连接: "Connected",
  已安装: "Installed",
  未找到匹配的钱包: "No matching wallets",
  尚未检测到钱包: "No wallets detected",
  "试试其他名称，或清除搜索查看全部钱包。":
    "Try another name or clear your search to see all wallets.",
  "请安装或启用钱包扩展后刷新页面，也可在钱包内置浏览器中打开。":
    "Install or enable a wallet extension and refresh, or open this page in your wallet’s browser.",
  "请在 {name} 中确认连接…": "Confirm the connection in {name}…",
  "选择钱包后，在钱包中确认连接":
    "Choose a wallet, then confirm the connection in your wallet.",
  不支持的网络: "Unsupported network",
  钱包已断开或返回无效网络:
    "Wallet disconnected or returned an invalid network.",
  钱包网络无效: "Invalid wallet network",
  钱包或网络已改变: "Wallet or network changed",
  浏览器钱包: "Browser wallet",
  部署清单文件名无效: "Invalid deployment file name",
  部署清单加载失败: "Unable to load the deployment manifest",
  "部署清单与 RPC 网络不匹配": "Deployment does not match the RPC network",
  合约代码与部署清单不匹配:
    "Contract code does not match the deployment manifest",
  合约版本不匹配: "Contract version mismatch",
  合约人数上限与部署清单不匹配:
    "Contract recipient limit does not match the deployment manifest",
  "交易哈希须为 32 字节十六进制":
    "Transaction hash must be 32 bytes in hexadecimal",
  核验网络不匹配: "Verification network mismatch",
  交易不是发给当前发奖合约:
    "Transaction is not addressed to the selected payment contract",
  交易不是批量发奖调用: "Transaction is not a batch payment call",
  交易名单长度不符: "Transaction recipient count mismatch",
  钱包尚未连接: "Wallet is not connected",
  "钱包连接已改变，请重新复核":
    "Wallet connection changed. Please review again.",
  "钱包连接不可用，请重新连接":
    "Wallet connection is unavailable. Please reconnect.",
  冻结快照摘要不匹配: "Saved payment details do not match their hash",
  "钱包或网络已改变，请重新复核":
    "Wallet or network changed. Please review again.",
  "RPC 网络与目标网络不匹配": "RPC network does not match the target network",
  合约地址没有代码: "No contract code at this address",
  人数超过合约上限或部署参数不匹配:
    "Recipient limit exceeded or deployment parameters do not match",
  "该批次已经执行，请继续核验，禁止重新付款":
    "This batch has already executed. Continue verification; do not pay again.",
  "RPC 返回的手续费参数无效": "RPC returned invalid fee parameters",
  "余额不足：需要奖励总额加保守 gas 准备额度":
    "Insufficient balance. Cover the total payments plus the reserved gas amount.",
  "恢复查询的 RPC 网络不匹配": "Recovery RPC network mismatch",
  该批次正在处理或需要先核验结果:
    "This batch is processing or its result needs verification first.",
  "钱包上下文改变，请重新复核": "Wallet context changed. Please review again.",
  钱包拒绝签名: "Signature rejected in wallet",
  另一个页面正在操作该批次: "Another page is processing this batch.",
  当前状态不可重试: "This batch cannot be retried in its current state.",
  "批次已执行或网络错误，请继续核验":
    "Batch already executed or network error. Continue verification.",
  "已取消这次钱包签名。": "This signature request was cancelled.",
  "这次钱包或网络请求未完成，交易结果需核验。":
    "The wallet or network request did not finish. Verify the transaction result.",
  "这次交易已回滚，奖励未发放；仍可能产生手续费。":
    "Transaction reverted. No payments were made; fees may still apply.",
  "这次交易已被取消。": "This transaction was cancelled.",
  "这次交易尚未通过完整核验。":
    "This transaction has not passed full verification yet.",
  草稿: "Draft",
  待复核: "Ready for review",
  等待钱包确认: "Awaiting wallet",
  待链上确认: "Pending confirmation",
  已核验发放: "Verified payment",
  交易回滚: "Reverted",
  交易取消: "Cancelled",
  结果待核验: "Needs verification",
  待检查: "Needs review",
  待付款: "Ready to pay",
  待签名: "Awaiting signature",
  确认中: "Confirming",
  已发放: "Paid",
  未发放: "Not paid",
  已取消: "Cancelled",
  待核验: "Unverified",
  "已取消连接，可以重新选择钱包。":
    "Connection cancelled. You can choose a wallet again.",
  "钱包中已有待处理的连接请求，请打开钱包继续。":
    "A connection request is already pending. Open your wallet to continue.",
  "连接未完成，请检查钱包是否已解锁后重试。":
    "Connection incomplete. Unlock your wallet and try again.",
  "AppKit 钱包": "AppKit wallet",
  "Arc 原生 USDC 批量奖励发放": "Batch payments with native USDC on Arc",
  "扫码连接暂不可用，请使用浏览器钱包。":
    "QR connection is unavailable. Please use a browser wallet.",
  "钱包连接组件暂时无法打开，请稍后重试。":
    "Unable to open the wallet connection dialog. Please try again.",
  钱包地址或校验和无效: "Invalid wallet address or checksum",
  "金额须为普通正十进制，最多 6 位小数":
    "Use a positive decimal amount with up to 6 decimal places",
  "金额须大于零且不超过 uint256":
    "Amount must be greater than zero and within uint256",
  金额不能为负: "Amount cannot be negative",
  "奖励总额超过 uint256": "Total amount exceeds uint256",
  "网络或批次 ID 无效": "Invalid network or batch ID",
  付款人或合约地址无效: "Invalid payer or contract address",
  冻结名单排序或金额不一致: "Saved recipient order or amounts do not match",
  "CSV 缺少表头": "CSV header is missing",
  "表头必须含 address、amount，仅可添加 label":
    "Headers must include address and amount. Only label is allowed as an extra column.",
  请添加至少一位收款人: "Add at least one recipient",
  "不能发给零地址、付款钱包或发奖合约":
    "Cannot send to the zero address, payer wallet, or payment contract",
  "收款地址重复，请主动修正": "Duplicate recipient address. Please correct it.",
  标签过长: "Label is too long",
  备份名单摘要或总额不匹配:
    "Backup recipient hash or total amount does not match",
  "已发放（链上核验）": "Paid (verified onchain)",
  地址无效: "Invalid address",
  不支持此备份网络: "Unsupported backup network",
  冻结快照摘要无效: "Invalid saved payment hash",
  "同一批次已有不同冻结快照，拒绝覆盖":
    "This batch already has different saved payment details. Overwrite refused.",
  "批次正在处理或已完成，请先核验结果":
    "This batch is processing or complete. Verify its result first.",
  合约人数上限无效: "Invalid contract recipient limit",
  "批次 ID 不能为零": "Batch ID cannot be zero",
  "该批次已执行，请核验历史交易":
    "This batch has already executed. Verify its previous transaction.",
  名单为空或人数超过合约上限:
    "Recipient list is empty or exceeds the contract limit",
  地址与金额数量不一致: "Address and amount counts do not match",
  收款地址被禁止: "Recipient address is not allowed",
  "地址必须严格升序，不能重复":
    "Addresses must be unique and in ascending order",
  奖励金额或精度不合法: "Invalid payment amount or precision",
  交易金额与奖励总额不一致:
    "Transaction value does not match the total payments",
  "收款钱包拒收，整个批次将回滚":
    "A recipient rejected the transfer. The entire batch will revert.",
  请通过发奖调用付款: "Use the batch payment function to send funds",
  合约阻止重入调用: "Contract blocked a reentrant call",
  "操作未完成，请检查钱包与网络":
    "Action incomplete. Check your wallet and network.",
  "本地存储无法读取：{error}": "Unable to read local storage: {error}",
  "草稿保存失败：{error}。付款前必须修复存储。":
    "Unable to save the draft: {error}. Fix local storage before paying.",
  "不允许的状态转换：{state} → {event}":
    "Invalid state transition: {state} → {event}",
  "CSV 格式错误：{error}": "Invalid CSV: {error}",
  "第 {row} 行列数与表头不一致":
    "Row {row} has a different number of columns than the header",
  "第 {row} 行需要地址和金额，用空格或制表符分隔":
    "Row {row} needs an address and amount separated by a space or tab",
  "人数超过合约上限 {limit}":
    "Recipient count exceeds the contract limit of {limit}",
  "第 {row} 行：{error}": "Row {row}: {error}",
};

export const EN_SINGULAR: Record<string, string> = {
  "已清空 {count} 行": "Cleared {count} row",
  "{count} 位收款人": "{count} recipient",
  "已发放至 {count} 位收款人": "sent to {count} recipient",
  "{count} 个步骤": "{count} step",
};
