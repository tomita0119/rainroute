import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "使い方 | RainRoute",
};

export default function HowToUsePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 sm:p-10">
      <div>
        <h1 className="text-2xl font-bold">使い方</h1>
        <p className="text-sm text-black/60 dark:text-white/60">移動ルート上の雨を、出発前に。</p>
      </div>

      <ol className="flex flex-col gap-4 text-sm leading-relaxed">
        <li>
          <span className="font-medium">1. 出発地・目的地を入力</span>
          <p className="text-black/70 dark:text-white/70">
            住所や地名で検索できます。経由地は最大5件まで追加可能です。
          </p>
        </li>
        <li>
          <span className="font-medium">2. 出発時刻を設定</span>
          <p className="text-black/70 dark:text-white/70">
            現在時刻がデフォルトで入っています。出発予定時刻に合わせて変更してください。
          </p>
        </li>
        <li>
          <span className="font-medium">3. 検索して結果を確認</span>
          <p className="text-black/70 dark:text-white/70">
            地図上にルートが色分け表示されます（緑=低リスク、黄=中リスク、赤=高リスク）。地図とは別に、ルート上の主要地点の天気・気温の一覧も表示されます。一覧の各地点をクリックすると前後の時間帯の詳細も見られます。
          </p>
        </li>
        <li>
          <span className="font-medium">4. 結果を共有・活用</span>
          <p className="text-black/70 dark:text-white/70">
            「共有リンクをコピー」で検索条件ごとURLとして共有できます（アカウント登録不要）。「Googleマップで開く」でそのままナビに引き継げます。
          </p>
        </li>
      </ol>

      <Link href="/" className="text-sm text-blue-600 underline dark:text-blue-400">
        トップに戻る
      </Link>
    </main>
  );
}
