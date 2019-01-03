import React from 'react'

import { StaticQuery, Link, graphql } from 'gatsby';
// import Img from 'gatsby-image';
import Layout from '../components/layout.js';
import '../components/layout.css'


class IndexPage extends React.Component {
  
  render() {
    const {data} = this.props
  return(
  <Layout>
    <div className="home-container">
    <div className="logo-home">
      <Img fluid={data.file.childImageSharp.fluid} fadeIn={false}/>
      {/* <img src={data.file.publicURL}/> */}
    </div>
    <div className="nav-home">
        <a href="/people" className="home-cat">
          <span>People</span>
        </a>
      <div className="home-edges"></div>
        <a href="/places" className="home-cat">
          Places
        </a>
      <div className="home-edges"></div>
        <a href="/periods" className="home-cat">
          Periods
        </a>
      <div className="home-edges"></div>
        <a href="/passages" className="home-cat">
          Passages
        </a>
      </div>
    </div>
  <div className="footer"></div>
  </Layout>)
  }
}

export default IndexPage

export const query = graphql`
  query {
    file(relativePath: { eq: "theographic-logo.png" }) {
      publicURL
      childImageSharp {
        fluid(maxWidth: 550, quality:100) {
          ...GatsbyImageSharpFluid
        }
      }
    }
  }
`
