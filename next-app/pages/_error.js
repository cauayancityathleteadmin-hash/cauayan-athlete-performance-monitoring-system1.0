import ErrorState from "../components/ErrorState";

function CustomError({ statusCode }) {
  return <ErrorState statusCode={statusCode} />;
}

CustomError.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default CustomError;
