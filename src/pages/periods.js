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
          <h1 className="sticky-title">Timeline of the Bible</h1>
          <div><i>The data for this page is under development.</i></div>
          <div>&nbsp;</div>
          {data.neo4j.EventGroup.map(group => (
            <div>
              {group.events[0].yearsOccurred[0].formattedYear} <Link to={'/period/'+group.slug}>{group.title}</Link>
            </div>
          ))}
        </div>
        <div className="footer"></div>
      </Layout>)
  }
}

export default PeriodsPage

export const query = graphql `
{
  neo4j {
    EventGroup(orderBy:sortKey_asc){
      title
      slug
      sortKey
      events(orderBy:sequence_asc){
        sequence
        yearsOccurred{
          year
          formattedYear
        }
      }
    }
  }
}
`