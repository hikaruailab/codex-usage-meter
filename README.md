# Codex Usage Meter

## 第三者向け手順

1. [GitHubリポジトリ](https://github.com/hikaruailab/codex-usage-meter)の「Code」から「Download ZIP」を選び、ZIPを展開します。
2. [Node.js LTS](https://nodejs.org/)をインストールします。追加のnpmパッケージは不要です。
3. macOSでは展開したフォルダの`start.command`、Windowsでは`start.bat`を実行します。
4. ブラウザに使用量メーターが開きます。実際のCodex使用量を表示するには、実行する人の環境にCodex CLIまたはChatGPT DesktopのCodex環境が必要です。

macOSでダブルクリックできない場合は、ターミナルで次を実行します。

```bash
cd ~/Downloads/codex-usage-meter-main
chmod +x start.command
./start.command
```

Codex連携を使わず画面だけ確認する場合は、起動後に`http://127.0.0.1:4317/?demo=1`を開きます。録画機能にはChromeまたはEdgeとffmpegが必要です。

## 起動

### macOS

`start.command`をダブルクリックします。

`start.command`だけを取得した場合も、必要なファイルを自動でダウンロードします。

Google ChromeまたはMicrosoft Edgeがインストールされている場合は、ツールバーのない独立ウィンドウで起動します。どちらもない場合は、標準ブラウザで開きます。

### Windows

`start.bat`をダブルクリックします。

`start.bat`だけを取得した場合も、必要なファイルを自動でダウンロードします。

Google ChromeまたはMicrosoft Edgeがインストールされている場合は、ツールバーのない独立ウィンドウで起動します。どちらもない場合は、標準ブラウザで開きます。

### ターミナルから起動

このフォルダで次を実行します。

```bash
node usage-bridge.mjs
```

その後、ブラウザで表示されたURLを開きます。`start.command`を使うと、空いているポートを4317番から自動で探してブラウザも開きます。4317番が使用中の場合は、次の空きポートを使います。

Codexの現在使用量を取得し、残り使用量を自動表示します。`usage-bridge.mjs`を起動せずに使う場合は、`index.html?demo=1`を開いてください。

## 使い方

- ゲージをクリックするとデザインを変更できます。
- E缶をクリックすると、標準の回復音で1目盛りずつ66.5ms間隔でゲージが回復します。
- `Shift`を押しながらE缶をクリックすると、確認なしで使用可能なリセットクレジットを1回消費します。
- E缶のグラフィックへマウスオーバーすると、ウィンドウが縦に拡張して残数と各E缶の期限、使用方法をE缶の下に表示します。マウスを外すと元の高さへ戻ります。
- 右上の歯車から設定専用ウィンドウを開き、BGM、回復速度、回復音、EQなどを調整できます。変更はメーター本体へ即時反映されます。
- BGMを有効にした場合は、BGM開始から1秒後に回復を開始します。
- BGM設定の次にある「録画する」をONにしてE缶または「回復を試す」を押すと、次の回復を回復完了から1秒後まで、音声付きMP4としてブラウザのダウンロード先へ保存します。録画中は仮想マウスがE缶へ移動して1秒間マウスオーバーし、使用期限を表示してからクリックします。
- BGMがOFFの録画には回復音だけが入り、ONの録画にはベースBGMと回復音が入り、回復完了後の1秒保持中もBGMが続きます。録画処理自身が実クレジットを消費することはありません。
- ゲーム音源との比較で決めた設定をデフォルトとし、そこからの調整内容を自動保存します。BGMのデフォルトはONです。

デフォルト設定は、音価50ms、回復・発音間隔66.5ms、25% PULSE、Attack0ms、Release1ms、3段階ピッチ更新16.5msです。E缶の上下・明滅アニメーションは360ms周期で、満タン後は500ms保持します。

## 動作環境

- Node.js
- JavaScriptを有効にしたWebブラウザ
- Codex連携を使う場合は、利用可能なCodex環境
- 録画機能を使う場合は、ChromeまたはEdgeとffmpeg

録画用の実行ファイルを標準パスで検出できない場合は、`USAGE_METER_CHROME_COMMAND`と`USAGE_METER_FFMPEG_COMMAND`で指定できます。

ブリッジは自分のコンピューター内だけで使用してください。

## 個人設定と生成ファイル

期限は通常、利用者自身のCodex環境から取得します。APIが期限を返さない場合は、`reset-credit-expirations.example.json`を`reset-credit-expirations.local.json`へコピーし、`expirations`へISO 8601形式の期限を記入できます。旧ファイル名の`reset-credit-expirations.json`も引き続き読み込みます。両方ある場合は`.local.json`を優先します。

個人設定、認証ファイル、生成動画・音声、ログ、解析データはGitの追跡対象から除外しています。録画には画面に表示する残量・期限が含まれるため、動画を共有する際はその内容を確認してください。
