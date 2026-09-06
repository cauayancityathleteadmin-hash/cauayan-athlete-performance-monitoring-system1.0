function ErrorPage({ statusCode, errorSummary }) {
  return (
    <div data-diag="serror" style={{ padding: 24, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
      <h3>Server error {statusCode}</h3>
      <pre>{errorSummary || "no error summary available"}</pre>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  let errorSummary = "";
  try {
    if (err && err.stack) errorSummary = String(err.stack);
    else if (err && err.message) errorSummary = String(err.message);
    else if (err) errorSummary = String(err);
    if (errorSummary.length > 4000) errorSummary = errorSummary.slice(0, 4000);
  } catch (e) {
    errorSummary = "unable to serialize error";
  }
  return { statusCode, errorSummary };
};

export default ErrorPage;
