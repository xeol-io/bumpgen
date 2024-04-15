import React from "react";
import ReactDOM from "react-dom";

function App() {
  return (
    <div>
      <h1>My React App</h1>
      <MyNewComponent />
    </div>
  );
}

function MyNewComponent() {
  return <p>This is my new component</p>;
}

ReactDOM.render(<App />, document.getElementById("root"));
