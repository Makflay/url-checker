import {
  JobCreateForm,
  JobDetailsPlaceholder,
  JobsListPlaceholder,
} from "../features/jobs";
import "./App.css";

export function App() {
  return (
    <div className="app">
      <header className="app__header">
        <div className="app__container app__header-content">
          <p className="app__eyebrow">URL monitoring</p>

          <h1 className="app__title">URL Checker</h1>

          <p className="app__description">
            Create asynchronous URL checking jobs and monitor their progress.
          </p>
        </div>
      </header>

      <main className="app__container app__main">
        <JobCreateForm />

        <div className="app__workspace">
          <JobsListPlaceholder />
          <JobDetailsPlaceholder />
        </div>
      </main>
    </div>
  );
}
