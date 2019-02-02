import React from 'react'
import { Link, graphql } from 'gatsby';
import Layout from '../components/layout.js';
import '../components/layout.css'


class PeriodsPage extends React.Component {

  render() {
    const { data } = this.props
    return (
      <Layout>
        <div className="container">
          <h1>Timeline of the Bible</h1>
        </div>
        <div className="footer"></div>
      </Layout>)
  }
}

export default PeriodsPage

export const query = graphql
`
{
  neo4j {
    EventGroup{
      title
      slug
      events{
        yearsOccurred{
          year
        }
      }
    }
  }
}
`