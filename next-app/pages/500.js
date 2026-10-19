import ErrorState from "../components/ErrorState";

export default function ServerError() {
  return <ErrorState statusCode={500} />;
}
