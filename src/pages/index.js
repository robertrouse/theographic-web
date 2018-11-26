import React from 'react'

import { StaticQuery, Link, graphql } from 'gatsby';
import Img from 'gatsby-image';
import Layout from '../components/layout.js';
import '../components/layout.css'


class IndexPage extends React.Component {
  
  render() {
    const {data} = this.props
  return(
  <Layout>
    <div className="container-2 w-container">
    <div className="logo-home">
      <Img fluid={data.file.childImageSharp.fluid} critical={true} fadeIn={false}/>
    </div>
    <div className="nav-home">
      <a href="/people" className="home-cat w-inline-block">
        <span>People</span>
      </a>
      <div className="home-edges"></div>
      <a href="/places" className="home-cat w-inline-block">
        Places
      </a>
      <div className="home-edges"></div>
      <a href="/periods" className="home-cat w-inline-block">
        Periods
      </a>
      <div className="home-edges"></div>
      <a href="/passages" className="home-cat w-inline-block">
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
      childImageSharp {
        fluid(maxWidth: 550) {
          ...GatsbyImageSharpFluid
        }
      }
    }
  }
`
