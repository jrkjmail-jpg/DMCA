import { appVersion } from "../motioncap/dataset/motionCapSchema";

type Props = {
  status: string;
};

export function AppHeader({ status }: Props) {
  return (
    <header className="app-header">
      <div>
        <h1>Dance Motion Cap Analytics {appVersion.versionLabel}</h1>
        <p>Левый набор данных — эталон педагога. Правый набор данных — выполнение ученика.</p>
      </div>
      <div className="status-pill">{status}</div>
    </header>
  );
}
