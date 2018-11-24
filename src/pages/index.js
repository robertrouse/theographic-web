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
    <div className="section-2">
      <Img fixed={data.file.childImageSharp.fixed} critical='true' />
    </div>
    <div className="section">
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
  </Layout>)
  }
}

export default IndexPage

// export const pageQuery = graphql`
//   query allPages {
//     allSitePage {
//       edges {
//         node {
//           path
//         }
//       }
//     }
//   }
// `;

export const query = graphql`
  query {
    file(relativePath: { eq: "theographic-logo.png" }) {
      childImageSharp {
        fixed(width: 550, height: 257) {
          ...GatsbyImageSharpFixed_tracedSVG
        }
      }
    }
  }
`
