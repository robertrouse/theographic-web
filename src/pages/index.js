import React from 'react'

import { Link, graphql } from "gatsby";
import Layout from "../components/layout.js";


class IndexPage extends React.Component {
  render() {
    // return (<Person/>);

    return(
  <Layout>
    <h1>Welcome to Theographic. While we're working on things, here's a list of all pages.</h1>
    {this.props.data.allSitePage.edges.map(edge => (
      <p key={edge.node.path}>
        <Link to={edge.node.path}>{edge.node.path}</Link>
      </p>
    ))}
  </Layout>)
  }
}

export default IndexPage

export const pageQuery = graphql`
  query allPages {
    allSitePage {
      edges {
        node {
          path
        }
      }
    }
  }
`;
