import ErrorState from "../components/ErrorState";

export default function NotFound() {
  return <ErrorState statusCode={404} />;
}
