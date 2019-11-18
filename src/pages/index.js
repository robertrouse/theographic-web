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
            <img src={logo} alt="Logo" className="logo-home" width="550px" height="257px" />
          </div>
          <SearchPane></SearchPane>
          {/* <div className="nav-home">
            <Link to="/people" className="home-cat">People</Link>
            <div className="home-edges"></div>
            <Link to="/places" className="home-cat">Places</Link>
            <div className="home-edges"></div>
            <Link to="/periods" className="home-cat">Periods</Link>
            <div className="home-edges"></div>
            <Link to="/passages" className="home-cat">Passages</Link>
          </div> */}
        </div>
        <div className="footer"></div>
      </Layout>)
  }
}

export default IndexPage