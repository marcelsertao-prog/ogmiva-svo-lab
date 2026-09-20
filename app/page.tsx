import { getChatGPTUser } from "./chatgpt-auth";
import { findConfiguredLearnerIdByExternalUserId } from "./configured-learner-identity";
import { getActiveLearnerId } from "./learner-identity";
import { LearnerJourney } from "./learner-journey";
import {
  loadD1LearnerProgress,
} from "./learner-progress-d1";
import { getOgmivaSessionLearnerId } from "./ogmiva-session";

export default async function Home() {
  const sessionLearnerId = await getOgmivaSessionLearnerId();
  const learnerId = sessionLearnerId ?? await resolveChatGPTLearnerId();

  if (!learnerId) return <SchoolLoginForm />;

  const initialProgress = await loadD1LearnerProgress(learnerId);

  return (
    <LearnerJourney
      learnerId={learnerId}
      initialProgress={initialProgress}
    />
  );
}

async function resolveChatGPTLearnerId() {
  const identity = await getChatGPTUser();
  if (!identity) return null;

  return getActiveLearnerId(
    identity,
    findConfiguredLearnerIdByExternalUserId,
  );
}

function SchoolLoginForm() {
  return (
    <main>
      <h1>Entrar no Ogmiva</h1>
      <form action="/api/learner-login" method="post">
        <label>
          Identificador escolar
          <input name="loginId" autoComplete="username" required />
        </label>
        <label>
          Credencial
          <input
            type="password"
            name="credential"
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}
