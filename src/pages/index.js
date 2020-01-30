import React from 'react';
// import { Link } from 'gatsby';
import SearchPane from '../components/search/SearchPane.js';
import Layout from '../components/layout.js';
import '../components/layout.css';
import logo from '../images/theographic-logo.png';

class IndexPage extends React.Component {

  render() {
    return (
      <Layout>
        <div className="home-container">
          <div className="logo-home">
            <img src={logo} alt="Logo" className="logo-home" width="100%" height="auto" />
          </div>
          <SearchPane></SearchPane>
        </div>
        <div className="footer"></div>
      </Layout>)
  }
}

export default IndexPage