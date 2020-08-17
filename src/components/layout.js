import React from 'react'
import PropTypes from 'prop-types'
import Helmet from 'react-helmet'
import { StaticQuery, graphql, Link } from 'gatsby'
import '../components/layout.css'

// import Header from './header'

const Layout = ({ children }) => (
  <StaticQuery
    query={graphql`
      query SiteTitleQuery {
        site {
          siteMetadata {
            title
          }
        }
      }
    `}
    render={data => (
      <>
        <Helmet
          title={data.site.siteMetadata.title}
          meta={[
            { name: 'description', content: 'Discover connections among the people, places, periods and passages of the Bible' },
            { name: 'keywords', content: 'bible, search, data' },
          ]}
        >
          <html lang="en" />
        </Helmet>
        <div
          style={{
            margin: '0 auto',
            maxWidth: 960,
            padding: 0,
            paddingTop: 0,
          }}
        >
          {children}
        </div>
        <footer id="nav-footer">
          <nav>
            <Link to={`/`} >Search</Link> &nbsp; &nbsp; | &nbsp; &nbsp;  
            <Link to={`/browse/`}>Index</Link> &nbsp; &nbsp; | &nbsp; &nbsp; 
            <Link to={`/about/`}>About</Link>
          </nav>
        </footer>
      </>
    )}
  />
)

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export default Layout
